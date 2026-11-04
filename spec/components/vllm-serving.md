# Component: vLLM Model Serving

**Status**: Proposed (2026-11-02)  
**Decisions**: [ADR-022](../adr/ADR-022-vllm-model-serving.md)  
**Related**: [cms-media-agent.md](cms-media-agent.md) (consumer), [gitops-argocd.md](gitops-argocd.md) (ApplicationSets), [terraform-infrastructure.md](terraform-infrastructure.md) (node groups, cluster Secret), [floci-local-environment.md](floci-local-environment.md) (k3s caps)

An OpenAI-compatible inference endpoint, `http://vllm.llm.svc.cluster.local:8000/v1`, serving model alias `cms-agent-llm`. It has two profiles: `cpu` (local floci, arm64) and `gpu` (EKS `dev`, one NVIDIA L4).

## Endpoint contract (both profiles)

| Item | Value |
|---|---|
| Service | `vllm` (ClusterIP) in namespace `llm`, port 8000 |
| API | `/v1/chat/completions` (streaming, `tools`, `tool_choice: auto`), `/v1/models`, `/health`, `/metrics` |
| Model alias | `cms-agent-llm` (`--served-model-name`); consumers never use the Hugging Face model name |
| Auth | none (`--api-key` unset); access limited by NetworkPolicy |
| Tool calling | `--enable-auto-tool-choice --tool-call-parser hermes` |
| Reasoning | `--reasoning-parser qwen3` and `--default-chat-template-kwargs '{"enable_thinking": false}'` (S1 run 7: `/no_think` alone did not stop reasoning after tool results); consumers also send `chat_template_kwargs.enable_thinking=false` and ignore `reasoning_content` |

## Profiles

| Item | `cpu` (local) | `gpu` (`dev`) |
|---|---|---|
| Image | upstream `vllm/vllm-openai-cpu:<version>-arm64@sha256:…` (S1: published for arm64, 1.24 GB; no local build), pulled by k3s directly. **v0.32.0 and v0.33.0 are broken on arm64 CPU** (vllm#61131: the first request kills the engine); use **v0.31.0** until the fix ships | upstream `vllm/vllm-openai:<pinned version>@sha256:…`, mirrored into ECR `cms-demo/vllm-openai` by CI (avoids Docker Hub pull limits on the node) |
| Model | `Qwen/Qwen3-1.7B` @ pinned revision (7–9 GiB pod); `Qwen/Qwen3-0.6B` when the node is shared (S1 run 3) | `Qwen/Qwen3-8B-FP8` @ pinned revision |
| Specific args | `--dtype float16 --max-model-len 6144 --max-num-seqs 1 --max-num-batched-tokens 2048` (S1: Apple M1 has no BF16; smaller warm-up) | `--max-model-len 16384 --gpu-memory-utilization 0.90 --max-num-seqs 8` |
| Env | `HF_HOME=/models`, `HF_HUB_OFFLINE=1`, `VLLM_CPU_KVCACHE_SPACE=1` (whole GiB only) | `HF_HOME=/models`, `HF_HUB_OFFLINE=1` |
| Resources | 0.6B: requests 3 CPU / 4 GiB, limits 5 CPU / 6 GiB (4.5 GiB OOM-kills warm-up, 5 GiB the first request; below ≈ 1B the footprint is set by vLLM's three processes and warm-up, not the weights); init container `fetch-model` limit 2 GiB | requests = limits: `nvidia.com/gpu: 1`, 3 CPU, 12 GiB |
| `/dev/shm` | `emptyDir` (Memory) 1 GiB | `emptyDir` (Memory) 2 GiB |
| Model cache | PVC `vllm-models` 10 GiB (default StorageClass) | PVC `vllm-models` 40 GiB gp3, AZ a |
| Placement | none (single node) | `nodeSelector: cms-demo/node-role: llm-gpu`; toleration `nvidia.com/gpu=true:NoSchedule` |
| Consumer tuning | agent `MaxConcurrentChats 1`, call timeout 180 s | agent `MaxConcurrentChats 4`, call timeout 45 s |

Common to both:

- `Deployment vllm`, 1 replica, `strategy: Recreate` (RWO cache volume; a single GPU), **`enableServiceLinks: false`**: otherwise Kubernetes injects `VLLM_PORT=tcp://<ip>:8000` for Service `vllm`, which vLLM reads as its own setting and crashes on (found in S1).
- **Init container `fetch-model`**: same image; runs `hf download <model> --revision <sha>` (`huggingface-cli download` in older images) into the Hugging Face cache under `HF_HOME=/models`. It is idempotent: a no-op when the revision is already cached. The main container runs `vllm serve <model> --revision <sha>` with `HF_HUB_OFFLINE=1`, so restarts never depend on Hugging Face and always load the pinned revision. The model ID and revision live in one overlay ConfigMap that both containers read. Qwen models are not gated, so no token is needed. If a gated model is chosen later, add `HF_TOKEN` from ExternalSecret `llm/<env>/hf-token`.
- **Probes**: `startupProbe` `GET /health` every 10 s, `failureThreshold` 90 (`cpu`) / 60 (`gpu`), which covers weight load and, on GPU, CUDA graph capture; `readinessProbe` `GET /health` every 10 s; `livenessProbe` `GET /health` every 30 s, `failureThreshold` 5.
- **Pod annotations** for metrics scraping: `prometheus.io/scrape: "true"`, `prometheus.io/port: "8000"`, `prometheus.io/path: /metrics` (verified in S4).
- **Security**: the upstream image runs as root, so the namespace enforces PSA `baseline`. Still: `allowPrivilegeEscalation: false`, capabilities dropped, `seccompProfile: RuntimeDefault`, `automountServiceAccountToken: false`. No IRSA (no AWS APIs).

## Repository layout

```
deploy/apps/llm/
  base/                    vllm Deployment, Service, PVC, NetworkPolicies (no image, model, args or storage class)
  overlays/cpu/            image, model, CPU args/env/resources, 10 GiB PVC
  overlays/gpu/            image, model, GPU args/resources, nodeSelector/toleration, 40 GiB PVC
deploy/argocd/applicationsets/llm-serving.yaml
deploy/argocd/applicationsets/nvidia-device-plugin.yaml
deploy/platform/nvidia-device-plugin/values.yaml
deploy/platform/namespaces/namespaces.yaml   (+ namespace llm, PSA enforce baseline, warn/audit restricted)
```

## GitOps wiring

- **`llm-serving` ApplicationSet**: a cluster generator with `matchExpressions: [{key: llm_profile, operator: In, values: [cpu, gpu]}]`; path `deploy/apps/llm/overlays/{{.metadata.labels.llm_profile}}`; destination namespace `llm`; project `cms-demo` (destination `llm` added to the AppProject). The registry for the `cpu` image comes from the cluster Secret annotation `ecr_registry`, as in `cms-demo`. Sync policy as `cms-demo` (automated, prune, selfHeal).
- **`nvidia-device-plugin` ApplicationSet**: same generator with `values: [gpu]`; Helm chart `nvidia-device-plugin` from `https://nvidia.github.io/k8s-device-plugin` (pinned version), project `platform`, namespace `kube-system`; `nodeSelector` `cms-demo/node-role: llm-gpu` and the GPU toleration.
- **Cluster label**: `llm_profile` comes from `cluster_labels` of the `gitops-bootstrap` Terraform module (`infra/terraform/modules/gitops-bootstrap/main.tf`). `envs/local`: `cpu`; `envs/dev`: `gpu`; `PROFILE=ci`: unset (no vLLM in CI).

## NetworkPolicy

In namespace `llm`:

- `default-deny-ingress` for all pods.
- `allow-inference`: to `app=vllm` on TCP 8000 from namespace `cms-demo`, pods `app in (cms-agent)`; `media-worker` is added only when Q5 adopts this endpoint.
- `allow-metrics-scrape`: to `app=vllm` on TCP 8000 from namespace `observability` (Coralogix agent; it does not use host networking).
- Egress stays open. The `fetch-model` init container needs `huggingface.co` and its CDN on first start.

## Terraform (`dev` only)

New optional input `gpu_node_group` on the EKS stack (default `null` = no GPU group; `envs/local` keeps `null` because floci's instance catalog has no GPU types):

```hcl
gpu_node_group = {
  instance_types = ["g6.xlarge"]          # fallback g5.xlarge (S2)
  ami_type       = "AL2023_x86_64_NVIDIA"
  capacity_type  = "SPOT"                 # ON_DEMAND if Spot capacity is unreliable
  azs            = ["a"]                  # same AZ as the vllm-models volume
  min_size       = 0
  max_size       = 1
  desired_size   = 0                      # ignored after creation; set by make llm-up/down
  disk_size_gib  = 100                    # CUDA image (~10 GB) + containerd snapshots
  labels         = { "cms-demo/node-role" = "llm-gpu" }
  taints         = [{ key = "nvidia.com/gpu", value = "true", effect = "NO_SCHEDULE" }]
}
```

- `make llm-up ENV=dev` / `make llm-down ENV=dev`: `aws eks update-nodegroup-config --scaling-config desiredSize=1|0` on the `gpu` node group. Optional: an ASG scheduled action that scales to 0 at 20:00 Europe/Berlin on weekdays.
- No IRSA role; no Secrets Manager entries (unless a gated model is adopted).
- The Budgets alarm (USD 600, 80 % / 100 %) stays as is; the GPU node is its largest variable item.

## Local environment

- No image build: upstream publishes `vllm/vllm-openai-cpu` for arm64 (S1). k3s pulls it on first start (≈ 1.2 GB).
- **k3s cap** (S1): `Qwen3-1.7B` needs a 7–9 GiB pod next to ≈ 6 GiB of apps, platform and load generator, which the default 10 GiB cap cannot hold. Kubelet only evicts when k3s itself nears the cap, so the cap must leave room for everything else in the Docker Desktop VM (floci's other containers, Docker Desktop's own Kubernetes, the VM kernel: ≈ 3–4 GiB). On a 19.5 GiB VM a 16 GiB cap let k3s exhaust the VM and take dockerd down; use ≤ 14 GiB there, or give the VM ≈ 24 GiB and use 16 GiB. The vCPU cap stays 6 (the VM has 6 CPUs). The cap is baked into kubelet's eviction setting when floci creates the k3s container, but the container's memory limit can be raised in place with `docker update --memory <MiB>m --memory-swap <MiB>m` (S1 run 5): with a 24 GiB VM and the 12 GiB-era `eviction-hard<7785Mi`, eviction starts at ≈ 16.1 GiB, so a 16.5 GiB limit (`FLOCI_EKS_MAX_MEMORY_MIB=16896`, pinned in `infra/local/.env`) keeps eviction below the OOM limit. vLLM idles at ≈ 0.9 core, so it stays at 0 while a load-sensitive demo runs.
- **Contention**: the load generator bursts up to 4 vCPU, so pause it while demoing the agent by stopping the run through the `canvas-load` admin UI or control API (`kubectl port-forward`). Scaling the StatefulSet by hand does not stick, because Argo CD self-heal reverts it. A `make` target for this is a nice-to-have.
- First start downloads ~3.4 GB of weights into the PVC. Later starts load from disk.

## Observability

- **Metrics** (`/metrics`, Prometheus format) scraped into Coralogix: `vllm:num_requests_running`, `vllm:num_requests_waiting`, `vllm:time_to_first_token_seconds`, `vllm:e2e_request_latency_seconds`, `vllm:prompt_tokens_total`, `vllm:generation_tokens_total`, and the KV-cache usage gauge (`vllm:kv_cache_usage_perc` in current releases; the name has changed across versions, so confirm against the pinned version).
- **Logs**: container stdout via the existing agent → Kafka → gateway path. Request logging is off (no prompts in logs).
- **Traces**: none from vLLM in v1. The agent's GenAI client spans cover each call. vLLM's OTLP tracing needs extra packages in the image; reconsider later.
- **GPU metrics** (DCGM exporter): not in v1.

## Spikes

| ID | Question | Exit criteria |
|---|---|---|
| S1 | vLLM CPU on arm64 inside floci k3s: build or find the image; load `Qwen3-1.7B`; does bf16 work on the host CPU (else fp32 doubles RAM)? Tokens/s; latency of a two-tool-round chat; clean `tool_calls` with `hermes` + `qwen3` reasoning parser + `/no_think` | p95 two-round chat ≤ 90 s and pod RSS ≤ 8 GiB, else switch to `Qwen3-0.6B` or fp32 and re-baseline the NFRs |
| S2 | GPU on EKS `dev`: `g6.xlarge` offered in eu-west-1 AZ a (`aws ec2 describe-instance-type-offerings`), Spot price and interruption rate; AL2023 NVIDIA AMI + device plugin → `nvidia.com/gpu` allocatable; which DaemonSets land on the x86 node and whether their images are multi-arch; `desired_size` ignored by Terraform; cold start (pull + load + graph capture) | GPU allocatable; all DaemonSets Running or deliberately excluded; cold start ≤ 10 min; fallback `g5.xlarge` documented if `g6` is unavailable |
| S3 | Microsoft.Extensions.AI + OpenAI .NET client against vLLM: streaming with tool-call deltas, tool-call ids, multi-round loop, cancellation frees the sequence, GenAI spans reach Coralogix | a scripted three-round conversation passes in both profiles; otherwise use non-streaming tool rounds (cms-media-agent R3) |
| S4 | Does the Coralogix otel-integration (`kubernetesExtraMetrics`, `scrapeAll: false`) pick up annotated pods in `llm`? | `vllm:num_requests_running` is queryable in Coralogix; otherwise add a static scrape job to `deploy/platform/coralogix-otel/base/values.yaml` |

## Verification

- `make local-verify` (with `llm_profile=cpu`): `vllm` pod Ready; `GET /v1/models` lists `cms-agent-llm`; a one-shot tool-call request returns `tool_calls`.
- `dev` after `make llm-up`: same checks, plus `kubectl describe node` shows `nvidia.com/gpu: 1` allocatable.
- `dev` after `make llm-down`: the agent's health reports `llm: unavailable`, the CMS stays fully functional, and the `llm-serving-dev` app is *Degraded* (expected).
