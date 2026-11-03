# Spike S1: vLLM CPU on the floci k3s cluster (arm64)

Question and exit criteria: [vllm-serving.md § Spikes](../../../../spec/components/vllm-serving.md#spikes).

## Findings so far (2026-11-02)

| Item | Result |
|---|---|
| Image | Upstream publishes an arm64 CPU image, so no source build is needed: `vllm/vllm-openai-cpu:v0.32.0-arm64@sha256:433cbee5e0b689095484090454b6fcdf0c68fe3eabfbb251a5e39d442917a4a6` (1.24 GB compressed; vLLM 0.32.0, torch 2.13.0+cpu, entrypoint `vllm serve`, `hf` CLI included, runs as root). Also published: `v0.33.0-arm64` and multi-arch `v0.32.0`. |
| Flags | `--tool-call-parser hermes` and `--reasoning-parser qwen3` exist in 0.32.0. Qwen3-specific `qwen3_json` / `qwen3_xml` tool parsers also exist and are alternatives to test. |
| Model | `Qwen/Qwen3-1.7B` @ `70d244cc86ccca08cf5af4e1e306ecf908b1ad5e`, Apache-2.0, not gated, 4.08 GB of safetensors. Fallbacks: `Qwen3-0.6B` @ `c1899de289a04d12100db370d81485cdf75e47ca`, `Qwen3-4B-Instruct-2507` @ `cdbee75f17c01a7cc42f958dc650907174af0554`. |
| Host CPU | **Apple M1 Pro: no BF16 and no I8MM** (`hw.optional.arm.FEAT_BF16: 0`; VM `Features` lack `bf16`). FP16 arithmetic is present (`fphp asimdhp`). `--dtype bfloat16` is therefore not viable on this laptop; try `float16` first, `float32` as fallback (≈ 2× weight memory). M2 and later have BF16. |
| Cluster capacity | Default floci cap (10 GiB container limit, eviction at the same point) leaves ≈ 3.2 GiB free next to the apps; vLLM with 1.7B needs ≈ 5.5–6 GiB. Rebuild with `FLOCI_EKS_MAX_MEMORY_MIB=16384`. The VM has 6 CPUs, so the vCPU cap stays 6. |

## Run

Prerequisites: the floci cluster was recreated with the larger cap, and the Docker Desktop Kubernetes stacks are paused so the VM has room (see below).

```bash
export KUBECONFIG=$PWD/infra/local/.kubeconfig
kubectl apply -f infra/local/spikes/s1-vllm-cpu/vllm-s1.yaml
kubectl -n llm logs -f deploy/vllm -c fetch-model      # first start: ~4 GB download
kubectl -n llm rollout status deploy/vllm --timeout=20m
kubectl -n llm port-forward svc/vllm 18000:8000 &
python3 infra/local/spikes/s1-vllm-cpu/probe.py --runs 3 --out /tmp/s1-float16.json
kubectl -n llm top pod                                # RSS against the 8 GiB exit criterion
```

Variants: `kubectl -n llm set env deploy/vllm VLLM_DTYPE=float32`, or change the model in ConfigMap `vllm-model` and restart.

Clean up: `kubectl delete -f infra/local/spikes/s1-vllm-cpu/vllm-s1.yaml` (deletes the PVC and its cached weights).

## Results

### Run 1 (2026-11-02): `Qwen3-0.6B`, float16, floci at the default 10 GiB cap

The cluster was not rebuilt with the larger cap, so the run used the 0.6B fallback (request 3.5 GiB, limit 5 GiB, `VLLM_CPU_KVCACHE_SPACE=1`).

| Finding | Detail |
|---|---|
| Service links crash vLLM | Kubernetes injects `VLLM_PORT=tcp://<ip>:8000` for a Service named `vllm`; vLLM reads `VLLM_PORT` as its own port setting and the worker dies with `ValueError: VLLM_PORT … appears to be a URI`. Fix: `enableServiceLinks: false` (in the manifest now). |
| Memory | A 4 GiB limit is too small even for 0.6B: vLLM's shared-memory preflight saw 4002 MiB used (weights, KV cache, and page cache from loading the safetensors). With 5 GiB the pod runs at ≈ 4.2 GiB working set. |
| float16 on M1 | Loads and serves; vLLM warns per layer that bf16 weights are cast to fp16. |
| Startup | Weights load 8–13 s; engine init (profiling, KV cache, warm-up) 130 s on a contended CPU; KV cache 9,344 tokens (1 GiB). |
| Eviction line = k3s cap | floci's kubelet evicts at `memory.available < 9833Mi`, where available = node capacity (the 19.5 GiB VM) − the k3s container's working set (kubelet stats summary). So eviction starts when k3s itself passes ≈ 9.9 GiB, i.e. at the 10 GiB cap. With vLLM running (k3s at ≈ 8.9 GiB), a `canvas-load` restart (Chromium, ≈ 1.4 GiB) crossed it, and kubelet evicted `vllm` and `canvas-load`; the `memory-pressure:NoSchedule` taint then blocked every new pod, including Argo CD's PreSync `kafka-topics` hook, for several minutes. |
| Node headroom | Apps + platform ≈ 4.3 GiB, `canvas-load` ≈ 1.4 GiB, vLLM 0.6B ≈ 4.2 GiB: does not fit under the default cap with the load generator running. Without it ≈ 8.6 GiB (≈ 1.3 GiB headroom). 1.7B (≈ 1.5 GiB more) needs the 16 GiB cap. |

### Run 2 (2026-11-02): `Qwen3-1.7B`, float16, floci rebuilt with `FLOCI_EKS_MAX_MEMORY_MIB=16384`

| Finding | Detail |
|---|---|
| Startup | Weights 16 s; engine init 99 s; KV cache 18,688 tokens (2 GiB), 2.28× concurrency at 8k context. |
| Memory | Pod working set 7.2 GiB after start, 9.0 GiB later (page cache) against a 9 GiB limit; the shared-memory preflight warned at 9.2 GiB used. Node (k3s) 12.9 GiB with the apps. |
| **vLLM v0.32.0 CPU bug** | The first chat completion killed the engine: `cpu_triton_utils._compute_slot_mapping_kernel_impl` asserts on a tensor (`RuntimeError: Boolean value of Tensor with more than one value is ambiguous`) → `EngineDeadError`, HTTP 500, container restart. Independent of the model. v0.32.0 is not usable on arm64 CPU; trying v0.33.0, fallback v0.31.0. |
| **VM exhaustion** | Upgrading to v0.33.0 (new 1.3 GB image, model reload) while the apps and load generator ran exhausted the 19.5 GiB Docker Desktop VM: the Kubernetes API reset connections and dockerd went down. With a 16 GiB cap, kubelet's eviction line (k3s at ≈ 15.6 GiB) sits above what the VM can actually give k3s once floci's other containers, Docker Desktop's own Kubernetes and the VM kernel take their ≈ 3–4 GiB, so the VM thrashes before kubelet evicts anything. A safe cap on this VM is ≈ 14 GiB, or the VM needs more memory (the host has 32 GB). |

Outcome: at 16:17 CET Docker Desktop then applied a `DiskSizeMiB` settings change from its GUI and recreated `Docker.raw` from scratch (48 GiB), which erased every image, container and volume in the VM, the floci environment and Docker Desktop's own Kubernetes data included. The probe has not produced latency or tool-calling numbers yet.

### Run 3 (2026-11-02): `Qwen3-0.6B`, vLLM v0.31.0, floci rebuilt at a 12 GiB cap, shared with the incident-workshop demo

| Finding | Detail |
|---|---|
| Image choice | The v0.32.0 crash is vllm#61131 ("CPU without Triton: slot-mapping fallback has a stale signature after #57169"); #57169 is in v0.32.0 and v0.33.0, the fix PR #61828 was closed unmerged, the issue is open. v0.31.0 predates #57169. |
| Model download | The `hf` CLI in v0.31.0 was OOM-killed at a 1 GiB init limit (6 times); 2 GiB works. |
| `VLLM_CPU_KVCACHE_SPACE` | Whole GiB only: `0.75` fails config validation (`invalid literal for int()`). |
| Memory floor | Even with `--max-num-seqs=1 --max-num-batched-tokens=2048 --max-model-len=6144` and a 1 GiB KV cache, warm-up was OOM-killed at 4.5 GiB and three times at 5 GiB before it started (init 60 s, KV 9,344 tokens). Running, the pod sits at its 5 GiB limit (page cache). Weights are only ≈ 1.4 GiB: three Python processes (API server, engine core, worker) with PyTorch, warm-up buffers and the KV cache make up the rest, so a smaller model (< 1B) barely changes the footprint. |
| Shared node | The demo needs the node under ≈ 11 GiB (its INC-1 scale-out adds ≈ 0.8 GiB). With vLLM idle the node read 11.16 GiB, so vLLM was scaled to 0 as agreed with that session. No inference was run. |

### Run 4 (2026-11-03 07:44–07:51): 10-minute window approved by the user

| Finding | Detail |
|---|---|
| Start | With no restarts, ready after 212 s (init 121 s), KV cache 9,344 tokens. |
| First request | OOM-killed at the 5 GiB limit on the first chat completion (probe), so the agent reported `llm: unavailable` and returned 503. |
| Retry at 6 GiB | Ready after 150 s, but at that moment the node reached 11.74 GiB: `cms-backend` and `canvas-backend` were being replaced by new ReplicaSets and `canvas-load` restarted. The watchdog scaled vLLM to 0 at 07:51:11. No inference completed. Without vLLM the node then held 9.9 GiB. |
| Agent telemetry | The agent's own spans from the window (`GET /api/agent/health`, `POST /api/agent/chat` via the gateway) arrived in Coralogix under application `cms-demo`, subsystem `cms-agent`: both the `AlwaysOnSampler` and the Downward-API resource-attribute fixes are confirmed live. |

Conclusion for the shared floci node: vLLM on CPU needs ≥ 6 GiB even for Qwen3-0.6B, against a node that already carries 5–10 GiB of demo workload (depending on the load generator and rollouts) under a 12 GiB cap. It only fits with the load generator stopped and no rollouts running, or with more VM memory.

### Run 5 (2026-11-03 08:07–08:14): Docker VM 24 GiB, k3s limit 16.5 GiB

The user raised Docker Desktop to 24 GiB; the k3s limit was raised live with `docker update --memory 16896m` (no recreate; eviction then starts at ≈ 16.1 GiB). Node 5.3 GiB before vLLM, 10.8 GiB with it.

| Finding | Detail |
|---|---|
| Start and first request | Ready after 145 s with a 6 GiB limit; first inference OK (5.5 s for one tool call), pod 5.4 GiB, ≈ 0.9 core even when idle. |
| End to end | Three chats through gateway → agent → vLLM → tool → cms-backend all streamed `status`/`delta`/`done` in 2–16 s. Coralogix shows `chat cms-agent-llm` (one per round), `orchestrate_tools`, `execute_tool search_media` with `gen_ai.tool.*` arguments and results, and the HTTP client spans. |
| Answer quality (Qwen3-0.6B, `tool_choice: auto`) | "How many files / how much space": **no tool call, made-up numbers**. "Top tags": wrote `list_tags` as text. "3 largest": called `search_media {limit: 3}` without `sortBy`, so it listed the newest files as the largest. |
| `tool_choice: required` on round 1 | Fixes both failures above (`get_media_stats`, `list_tags {limit: 5}`), at 22–25 s per round because guided decoding fills every field, invented dates included. "3 largest" still had no `sortBy` and an invented date range. |

Agent changes from this run: round 1 is sent with `tool_choice: required` (`Agent:RequireToolOnFirstRound`), named periods ignore `from`/`to`, content types are normalised (`images` → `image`, `jpg` → `image/jpeg`), and the `sortBy` and stats tool descriptions are explicit. Not deployed yet: an image change flips the single floci image tag and restarts every demo workload.

Conclusion: the serving path and the agent's telemetry work; Qwen3-0.6B is too weak for reliable arguments. With the 24 GiB VM, Qwen3-1.7B (7–9 GiB) now fits under the 16.1 GiB eviction line (≈ 14.4 GiB with the apps); try it after the demo, together with the agent changes, and run the full probe.

### Run 6 (2026-11-03 10:24–10:30, during demo prep): new agent image

Deployed `sha-710f5c9c9668-agent-1793691302` (forced first tool call, argument fixes, GenAI semconv) by flipping only the image tag; all workloads rolled in 37 s, `cms-backend` 2/2. vLLM 0.6B was up 10:27–10:30 for one chat, then stopped for the demo at the user's request.

| Finding | Detail |
|---|---|
| Answer | "How many media files…" → `get_media_stats`, grounded answer ("There are 307 media files…"), 2 rounds, 80 s with the demo's load generator sharing the CPU (node 72 %). |
| Latency split | Round 1 (forced tool call): 18 s, first chunk at 9.0 s. Round 2: 61 s, of which 106 of 122 output tokens were Qwen3 reasoning despite `/no_think`; disabling thinking per request should cut most of it. |
| Memory | Node 11.8 GiB with vLLM; with the INC-1 scale-out the demo session estimated ≈ 0.4 GiB above the eviction line, so vLLM stays at 0 during demos. |

### Run 7 (2026-11-03 15:21–15:25): thinking off

vLLM started with `--default-chat-template-kwargs={"enable_thinking": false}` (present in v0.31.0, `vllm/entrypoints/launchers/cli_args.py`). A round-2 request after a tool result produced **0 reasoning tokens** (run 6: 106 of 122) and answered "There are 307 media files in the library." in 10.4 s; the agent chat through the gateway took **28 s** (run 6: 80 s, partly under the demo's load). Starting vLLM briefly lifts `demo-cms-api` p95 over the P1 alert threshold (150 ms), so a test can page Slack `#production-alerts`.

Deployed 2026-11-03 17:24 as `sha-710f5c9c9668-agent-1793722988`: the agent now also sends `chat_template_kwargs.enable_thinking=false` per request (tag flip only, all workloads rolled in 32 s, `cms-backend` 2/2).

### Next run

1. Docker Desktop: more VM memory (≈ 24 GiB on this 32 GB host) or keep the floci cap at ≈ 14 GiB; restore the disk size if 48 GiB was not intended.
2. Prove vLLM in isolation first (no load generator): v0.33.0-arm64, `Qwen3-1.7B`, one request, then the probe.
3. Then the agent end to end.
