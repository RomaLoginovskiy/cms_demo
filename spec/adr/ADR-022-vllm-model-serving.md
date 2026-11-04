# ADR-022: Self-Hosted LLM Serving with vLLM (CPU Locally, GPU on EKS)

**Status**: Proposed  
**Date**: 2026-11-02  
**Parent**: [ADR-017](ADR-017-aws-eks-gitops-platform.md)  
**Related**: [ADR-021](ADR-021-cms-media-qa-agent.md) (first consumer), [vllm-serving.md](../components/vllm-serving.md) (contract), delivery-plan open question Q5 (captioning endpoint)

## Context

The CMS media agent (ADR-021) needs an OpenAI-compatible chat endpoint with tool calling. The required stack is **vLLM hosted on Kubernetes**, in both the local floci environment and EKS `dev`.

| Environment | Compute available today | Limits that matter |
|---|---|---|
| `local` (floci k3s) | one k3s container on an Apple Silicon host, `linux/arm64`, no GPU passthrough | container capped at 6 vCPU / 10 GiB by default (`FLOCI_SERVICES_EKS_MAX_*`); Docker Desktop has ~19.5 GiB in total |
| CI (`PROFILE=ci`) | GitHub `ubuntu-24.04-arm` runner | 4 vCPU / 12 GiB k3s cap, 14 GB disk: no room for a multi-GB inference image plus weights |
| `dev` (EKS) | managed node group `default`, Graviton `m7g.xlarge` ×2, no GPU | budget alarm at USD 600 / month for the whole environment |

Q5 (captioning endpoint for `media-worker`) is still open. It needs a *vision* model, so it is a possible second consumer of the same serving layer, but it is not part of this decision.

Four questions: what hardware runs inference in each environment, which model, how serving is packaged and deployed, and how the cost stays inside the budget.

## Decision

### 1. Hardware per environment

- **local: vLLM CPU backend on arm64.** Docker Desktop on macOS cannot pass a GPU to Linux containers, so CPU is the only option inside k3s. vLLM supports AArch64 CPUs, and upstream publishes `vllm/vllm-openai-cpu:<version>-arm64` (confirmed in S1), so no source build is needed. Apple M1 has no BF16, so the `cpu` profile runs `float16`.
- **dev: one GPU node.** A second managed node group, `gpu`, with AMI `AL2023_x86_64_NVIDIA` and instance `g6.xlarge` (1× NVIDIA L4 24 GB, 4 vCPU, 16 GiB). It runs in a single AZ (a), with min 0 / max 1 and taint `nvidia.com/gpu=true:NoSchedule`. The NVIDIA device plugin runs as an Argo CD platform app on that node only.
- **CI: no inference.** The agent is tested against a scripted fake chat client (unit tests) and reports `llm: unavailable` in the floci e2e run.

Alternatives considered for `dev`:

| Option | Why not (v1) |
|---|---|
| `g5g` (Graviton2 + T4G 16 GB, arm64) | keeps one CPU architecture, but T4G has no bf16/FP8, only 16 GB, and arm64 CUDA builds of vLLM are not a well-trodden path |
| `g5.xlarge` (A10G 24 GB) | viable **fallback** if `g6` capacity is missing in eu-west-1 (no FP8: run the bf16 or AWQ variant) |
| Inferentia2 (`inf2`) with the Neuron vLLM backend | different image and a model compile step; more moving parts than one demo needs |
| Managed API (Bedrock, OpenAI) | not the requested stack; the agent still talks the OpenAI protocol, so this stays a config-only escape hatch |

The `gpu` node is the cluster's only x86_64 node. Every image *we* build stays `linux/arm64`. The vLLM image is upstream and schedules only onto the tainted GPU node. DaemonSets that tolerate all taints must be multi-arch (spike S2).

### 2. Model

Requirements: a permissive licence (Apache-2.0 or MIT) for use in a vendor demo, native tool calling with a vLLM tool parser, solid instruction following, and a size that fits the hardware above.

| Profile | Model | Why |
|---|---|---|
| `gpu` | `Qwen/Qwen3-8B-FP8` | Apache-2.0; ~9 GB of weights in FP8, which L4 (Ada) runs natively, leaving ~10 GB for KV cache; good tool calling via vLLM's `hermes` parser |
| `cpu` | `Qwen/Qwen3-1.7B` | Apache-2.0; ~4 GB in fp16/bf16; same family, prompt and parser as `gpu`; fallbacks `Qwen/Qwen3-4B-Instruct-2507` (better quality, ~2× RAM) or `Qwen/Qwen3-0.6B` (if RAM is short) |

- Thinking mode is disabled: the agent appends Qwen3's `/no_think` switch to the system prompt, and vLLM runs `--reasoning-parser qwen3`, so any stray reasoning lands in `reasoning_content`, which the agent ignores.
- Every profile serves the model under the fixed alias **`cms-agent-llm`** (`--served-model-name`). Agent configuration never changes when the model does.
- The model revision (Hugging Face commit SHA) and the image digest are pinned in Git.
- Rejected: Qwen2.5-3B (non-commercial research licence); Llama 3.x (custom community licence and acceptable-use policy, more paperwork than Apache-2.0); Mistral-7B-Instruct (weaker tool calling at this size).

### 3. Packaging and placement

vLLM gets its own Argo CD **ApplicationSet `llm-serving`** in its own namespace **`llm`**. It is generated only for clusters whose Argo CD cluster Secret carries the label `llm_profile` (`cpu` or `gpu`), and it renders `deploy/apps/llm/overlays/<llm_profile>`. The label comes from `cluster_labels` in the `gitops-bootstrap` Terraform module: `local` → `cpu`, `dev` → `gpu`, and the CI profile → unset.

Rejected alternative: a kustomize component inside the `cms-demo` overlays. The `cms-demo` overlay path is chosen by environment name, and CI uses the same `local` overlay, so CI could not drop the inference workload. GPU tolerations and quotas would also mix with app manifests, and a later captioning consumer (`media-worker`) would depend on an app-internal component.

### 4. Cost control (`dev`)

`g6.xlarge` on-demand costs roughly USD 0.9 / h in eu-west-1 (to be confirmed in the AWS Pricing Calculator). Always on, that is about USD 650 / month, more than the whole `dev` budget. Therefore:

- The GPU node group defaults to **desired 0**. `make llm-up ENV=dev` / `make llm-down ENV=dev` set the desired size to 1 / 0 (Terraform ignores `desired_size` after creation; to be verified in S2).
- Spot capacity is allowed in `dev`. An interruption only makes the agent report `llm: unavailable`.
- Model weights are cached on a 40 GiB gp3 PVC in AZ a (the same AZ as the node group), so a restart does not download them again.
- While the GPU node is down, the `llm-serving-dev` Argo CD app shows *Degraded* (pending pod). This is accepted and documented. Scale-from-zero on pending pods (Karpenter or Cluster Autoscaler) stays a phase-4 decision (ADR-017).

## Consequences

- One serving layer, one protocol (OpenAI-compatible) and one model alias in every environment. Only the overlay differs between CPU and GPU.
- Local answers are slow (tens of seconds) and less reliable than on the GPU. The evaluation gate in the agent contract uses a lower pass threshold for `cpu` (70 %) than for `gpu` (90 %).
- The local k3s cap must rise when `llm_profile=cpu` (target 6 vCPU / 16 GiB; the Docker Desktop VM has 6 CPUs), and the load generator competes for CPU. The demo guidance is to pause load generation while using the agent locally.
- `dev` gains an x86 GPU node, the NVIDIA device plugin and a scale-to-zero runbook.
- Q5 can later reuse this layer by adding a vision-model deployment in namespace `llm`. That needs its own decision (model choice, a second GPU or time-sharing).
