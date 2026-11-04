# AWS EKS Delivery Plan

**Status**: Proposed (2026-10-30)  
**Architecture**: [aws-eks-platform.md](aws-eks-platform.md) · **Decisions**: [ADR-017](../adr/ADR-017-aws-eks-gitops-platform.md)–[ADR-020](../adr/ADR-020-aws-data-services-mapping.md)

## Overview

| Phase | Goal | Exit criteria | Effort (engineer-days) |
|---|---|---|---|
| 0 — Spikes | Prove floci can carry the design | S1–S8 pass or have an accepted fallback | 2–3 |
| 1 — Local platform | Full stack on floci via Terraform + Argo CD | floci fitness functions F1–F6 green in CI | 8–12 |
| 2 — AWS `dev` | Same code on real AWS | `https://cms-dev.<domain>` works end to end, telemetry in Coralogix | 5–8 |
| 3 — Managed data | Remove single-replica blockers (app changes) | S3 + PostgreSQL + Kafka TLS live in `dev`; cms-backend at 2 replicas | 8–12 |
| 4 — Production | `prod` account and hardening | prod checklist (below) signed off | 10–15 |
| Parallel | Runtime upgrades and bug fix | .NET 10, Node LTS, title bug fixed | 2–4 |

Phases 0–2 need no application code changes. The parallel track can start immediately and should land before `dev` go-live because .NET 8/9 lose support on 2026-11-10.

## Implementation status (2026-11-02)

| Item | State | Evidence |
|---|---|---|
| WP 1.1–1.8 code: `infra/terraform` (9 modules, 4 stacks, `envs/local`, `envs/dev`), `infra/local` (compose + scripts), root `Makefile`, `deploy/` (2 AppProjects, 13 ApplicationSets, platform and app manifests), `.github/workflows` (ci, images, terraform, e2e-floci), loadgen `.dockerignore` | written | — |
| Static checks | passing | `terraform validate` for all stacks (Terraform 1.6.2, AWS provider 6.71.0, modules vpc 6.7 / eks 21.29 / iam 6.8 / msk 3.3); `terraform fmt`; all app overlays and both Coralogix overlays render with Kustomize (chart 0.0.371); 98 YAML files parse; `docker compose config`; `bash -n` on every script |
| Phase 0 spikes S1–S8 on floci | run 2026-11-01 | S1, S3, S4, S5, S7, S8 pass; S2 needed its fallback (in forward form, G16); S6 passes without the eBPF profiler (G17). Details in the spike table |
| Phase 1 local run | **green** 2026-11-01 | `make local-all` + `make local-verify` on Docker Desktop (arm64, 6 CPUs, 19.5 GiB, next to the existing Docker Desktop Kubernetes workloads): 16/16 checks of F1–F5 pass; 9/9 Argo CD Applications Synced/Healthy; k3s node 5.9 CPU / 8 GiB allocatable, ~5.5 GiB used. Rerun 2026-11-02 with the new F3/F4 checks: 18 pass, least-privilege checks skipped (enforcement off) |
| Phase 1 gaps (2026-11-02) | mostly closed | F6: `make local-nuke` destroys all three stacks (123 resources, 1 min 39 s). Its first check passed falsely: it matched only volumes labelled `io.floci=aws`, so about 13.7 GB of floci volumes stayed behind (G24) and the networks of G23 too; `nuke.sh` now selects floci resources by every label and name floci uses and by the volumes their containers mount. The fixed teardown is rerun after the enforcement run. Module tests: `make tf-test` passes 8 suites / 15 runs, `gitops-bootstrap` excepted (WP 1.3). F4 now checks the 5 MiB upload limit (S5). CI on PR 1: `manifests` failed on the `dev` hostname placeholder and on an invalid `ClientTrafficPolicy` field (`proxyProtocol.forwardProtoConfig` does not exist in Envoy Gateway 1.9; removed), `secrets-scan` on the RFC 6455 sample nonce in `verify.sh` (now random; `.gitleaksignore` for the old commit). Still open: the CI e2e job; real Coralogix delivery needs the owner's keys in `infra/local/.secrets.env` |
| From-scratch run with IAM enforcement (S3 rerun) | **green** 2026-11-02 | `FLOCI_IAM_ENFORCEMENT=true make local-all` on a 135 GB Docker Desktop disk, then `make local-verify`: 21/21 checks pass, including the least-privilege checks (the app role reads its own secret and is denied the Coralogix ingest key and `cms-demo/dev/*`); `make tf-test` 8/8 suites under enforcement. Found and fixed on the way: the Git mirror lost its user after a teardown (git-sync now ensures it every run, nuke deletes the password file); floci's k3s restart died again (G22, `local-gitops` now restarts it); every External Secrets read was denied (G25, reader policies also list the suffix-less ARN); the F3 checks themselves ran with an empty `AWS_PROFILE` and could never pass |
| Fixes from the run | applied | Gateway API CRDs on the standard channel (G21); CoreDNS import (G16); AppProjects at sync-wave -1; profiler moved to `opentelemetry-ebpf-profiler` and disabled on floci (G17); Coralogix exporter needs a non-empty key, so the Terraform placeholder is `placeholder-not-a-key`; `eks-token.sh` pins the kubeconfig token to the floci profile, because ambient `AWS_*` variables otherwise win; F1 filters G18/G19; F5 no longer races the worker backlog; `make local-sync` terminates retrying syncs |
| AWS `dev` | blocked on Q1, Q3, Q4 | placeholders in `infra/terraform/envs/dev/*`; Terraform guards refuse to apply until they are filled in |

## Phase 0 — Spikes on floci

| ID | Question | Method | Pass | Fallback |
|---|---|---|---|---|
| S1 | Does floci 2.3.0 run an EKS **1.37** k3s cluster on arm64 Docker Desktop, reachable via `aws eks update-kubeconfig`? (Result 2026-11-01: k3s 1.37 starts; floci's add-on catalog stops at 1.32, so add-ons are skipped on floci, gap G15; the instance catalog lacks `m5.2xlarge`, G20) | create cluster with the `local-admin` key, caps `FLOCI_SERVICES_EKS_MAX_*`, `FLOCI_SERVICES_EKS_ENDPOINT_MODE=host`, `kubectl get nodes`; record the k3s container name and its `io.floci.*` labels | node `Ready`, token auth works, limits applied | use 1.36 in every environment, or pin a k3s patch via `FLOCI_SERVICES_EKS_IMAGE_TEMPLATE` |
| S2 | Can pods resolve and reach `floci:4566` and floci-spawned containers (Redpanda, Postgres proxy)? (Result 2026-11-01: no; k3s replaces Docker's loopback resolver with `8.8.8.8`. Fallback adopted in forward form: CoreDNS forwards to floci's DNS, which also resolves the broker name Redpanda advertises, G16) | busybox pod: `nslookup`, `wget` | both resolve via floci's embedded DNS | `coredns-custom` ConfigMap with static hosts (floci at `172.30.0.10`) |
| S3 | Does ESO JWT auth work against floci STS, and read Secrets Manager/SSM through endpoint overrides? (Result 2026-11-01: yes once S2's fallback is in; all four ClusterSecretStores Valid. 2026-11-02 with IAM enforcement: passes once reader policies also list the suffix-less secret ARN, G25; the app store is denied the ingest key) | ESO Helm install, the two `ClusterSecretStore`s (`eso-app`, `eso-observability`) with namespace conditions, ExternalSecrets against placeholder values; rerun with `FLOCI_SERVICES_IAM_ENFORCEMENT_ENABLED=true` | secrets materialise; the app store cannot read the ingest key | local-only static ESO credentials (recorded as a gap) |
| S4 | Path-style ECR push from the host and pull inside k3s? (Result 2026-11-01: yes, six images pulled through the mirror) | `docker login localhost:4566`, push 6 arm64 images, deploy one | pull succeeds through the generated `registries.yaml` mirror | hostname URI style (classic image store) or `ctr images import` |
| S5 | Envoy Gateway on k3s serves the routing contract? (Result 2026-11-01: yes for the F4 checks, incl. the WebSocket upgrade and `/v1/traces`, once the CRDs use the standard channel, G21; 2026-11-02: an upload just under 5 MiB is accepted and one over it is rejected with 400) | Helm install (controller in `GatewayNamespace` mode); Gateway + HTTPRoutes; ServiceLB + `edge` socat; SignalR negotiate + WebSocket; a 5 MB upload accepted and a larger one rejected by the API; `POST /v1/traces` reaches the collector; load generator against `cms-edge.edge.svc.cluster.local:443` | all checks pass at `localhost:8080` | `kubectl port-forward` edge; NodePort |
| S6 | Coralogix `otel-integration` on k3s-in-Docker? (Result 2026-11-01: agent, cluster collector and `otel-gateway` run and accept spans (the gateway was removed 2026-11-02, Q7); delivery to Coralogix untested with the placeholder key. The legacy eBPF profiler is incompatible with chart 0.0.371's collectors and the otelcol profiler cannot run on floci, G17) | Kustomize `helmCharts` render; local `mountPropagation` patches; backend → `$(NODE):4318`; eBPF profiler | spans and logs reach Coralogix (with a real key) | disable eBPF profiler and host metrics locally |
| S7 | Do the pinned terraform-aws-modules (vpc 6.7, eks 21.29, msk 3.3, iam 6.8) apply on floci, re-plan empty, and destroy cleanly? Does S3 lockfile work on floci? (Result 2026-11-01: apply works with the G13–G15 adaptations; re-plan empty apart from response quirks G18/G19; 2026-11-02: clean destroy, F6) | `envs/local/infra` apply ×2, destroy | empty second plan; clean destroy | pin the module minor that works; thin native resources for the failing part; keep DynamoDB locking |
| S8 | Kafka through floci MSK end to end? (Result 2026-11-01: yes; topics Job, upload → `media.uploaded` → worker, F5) | `GetBootstrapBrokers` from pods; topics Job; upload → `media.uploaded` → worker log | message consumed | Redpanda via Argo CD locally (loses MSK API parity only) |

Spike results are written back into [floci-local-environment.md](../components/floci-local-environment.md) (gap table, settings) before phase 1 starts.

## Phase 1 — Local platform on floci

| WP | Work | Output |
|---|---|---|
| 1.1 | Scaffolding: `infra/`, `deploy/`, `.github/workflows/ci.yml`; `.gitignore` for `.env.local`, `.secrets.env`, `.terraform/`, `*.tfstate*` | repo layout per component specs |
| 1.2 | `infra/local`: compose, scripts, root `Makefile` targets (`local-up`, `local-identity`, `local-state`, `local-apply-global`, `local-images`, `local-apply`, `local-secrets`, `local-gitops`, `local-kubeconfig`, `local-edge`, `local-all`, `local-verify`, `local-retarget`, `predestroy`, `local-down`, `local-nuke`) | one-command local bring-up |
| 1.3 | Modules `network`, `eks`, `ecr`, `msk`, `app-config`, `gitops-bootstrap` with `terraform test` on floci | module contracts implemented |
| 1.4 | Stacks `global` (ECR), `infra`, `gitops` with `envs/local` | cluster + Argo CD on floci |
| 1.5 | `deploy/argocd` projects and ApplicationSets; add-ons `namespaces`, Argo CD (self-managed), ESO (two stores), Reloader, Envoy Gateway | platform converges |
| 1.6 | `deploy/apps/cms-demo` base, `overlays/local`, components; manifest fixes from the workload contract; HTTPRoutes; ExternalSecrets; topics Job | app converges |
| 1.7 | `deploy/platform/coralogix-otel` (chart via Kustomize, local patches, `/v1/traces` route) | telemetry path |
| 1.8 | CI: render + kubeconform, Terraform gates, image builds, gitleaks; nightly/label floci e2e on `ubuntu-24.04-arm` | automated regression |

Exit: fitness functions F1–F6 ([floci spec](../components/floci-local-environment.md#verification-fitness-functions)) pass locally and in CI.

## Phase 2 — AWS `dev`

| WP | Work | Output |
|---|---|---|
| 2.1 | Prerequisites: account (Q1), admin role, hosted zone (Q3), allowlist (Q4), budget recipients (Q9) | answers recorded in ADR-017 |
| 2.2 | `bootstrap` state bucket (operator, once) | remote state |
| 2.3 | `global`: ECR, GitHub OIDC roles, budget | CI can push images |
| 2.4 | `infra` stack with `envs/dev`: VPC, EKS 1.37 (2× m7g.xlarge), add-ons, IRSA roles, access entries, MSK, app-config, edge-dns | AWS resources + SSM contract |
| 2.5 | Secret values written; `gitops` stack with `envs/dev` from an allowed CIDR | Argo CD running |
| 2.6 | AWS-only add-ons: AWS LBC (cluster/VPC/region values, webhook-cert `ignoreDifferences`), external-dns (owns the public record), metrics-server, `gp3` StorageClass, AWS `EnvoyProxy` (NLB class, TLS 443 + redirect listener, source ranges) | public HTTPS entry |
| 2.7 | CI `images.yml` (skips existing tags) + promote-dev PR opened by a GitHub App; `terraform.yml` plan/apply with environment approval | hands-off delivery to `dev` |
| 2.8 | Verification (below); 7-day cost review against the estimate | go-live note |

Exit (`dev` definition of done):

- [ ] `https://cms-dev.<domain>/` (canvas) and `/cms` load; board edits sync between two browsers over WebSocket; uploads succeed.
- [ ] Upload → `media.uploaded` → media-worker consumption visible in traces (captioning per Q5).
- [ ] Coralogix shows RUM sessions for both frontends, backend traces with Kafka spans, container logs via the Kafka log path, and Kubernetes infrastructure data for `cms-dev`.
- [ ] `terraform plan` empty for every stack with `envs/dev`; all Argo CD Applications `Synced/Healthy`; manual drift reverted.
- [ ] No static credentials: IAM credential report shows no access keys for CI or workloads.
- [ ] Budget alarm active; first-week spend within 20 % of the estimate.

## Phase 3 — Managed data (application changes, ADR-020)

| WP | Work | Depends on |
|---|---|---|
| 3.1 | Kafka client passthrough → MSK `TLS` only (port 9094); configurable message timeout | — |
| 3.2 | `S3MediaStore`, `s3-media` module, IRSA role for cms-backend; remove uploads PVC | — |
| 3.3 | `Database:Provider` setting, Npgsql, EF migrations (CMS) + PostgreSQL migration set (canvas), migration Jobs, `rds-postgres` module | — |
| 3.4 | Optional search: `opensearch` module, `Elasticsearch__Url` from SSM | — |
| 3.5 | cms-backend to 2 replicas + HPA; remove `Recreate` | 3.2, 3.3 |

Each WP is tested on floci first (floci S3, RDS Postgres container, Redpanda), then promoted to `dev`.

## Phase 4 — Production readiness

- `prod` account, `envs/prod/*`, cross-account ECR pull (or image copy) decided.
- RDS Multi-AZ; MSK 3 brokers with IAM auth; SignalR backplane on ElastiCache (Valkey) and presence out of process; canvas-backend > 1 replica.
- Argo CD HA + SSO, admin disabled; human Kubernetes access read-only.
- Interface VPC endpoints; Coralogix PrivateLink (optional); WAF decision (CloudFront in front of the NLB, or ALB per ADR-018 option B).
- AWS Backup plans for RDS/EBS; restore drill; EKS upgrade runbook rehearsed on `dev`; incident and DR runbooks.
- Load test at expected peak using the load generator against `dev`.

## Parallel track

| Item | Why | Size |
|---|---|---|
| .NET 10 LTS for `cms-backend`, `media-worker`, `canvas-backend` (TFM, base images, EF Core/OTel packages) | .NET 8 and 9 end of support on 2026-11-10 | M |
| Node LTS for both frontend build stages | Node 18 is end of life | S |
| Fix `MediaService.UpdateAsync` overwriting `Title` with null | blocks captioning | S |
| `.dockerignore` for the load generator; pin nginx base image | reproducible builds | S |

## Open decisions

| ID | Decision | Default if unanswered | Needed by |
|---|---|---|---|
| Q1 | AWS account(s) for `dev` (and later `prod`) | one `dev` account now, separate `prod` account in phase 4 | phase 2 |
| Q2 | Region | `eu-west-1` (same region as Coralogix EU1) | phase 1 |
| Q3 | Public domain and Route 53 zone for `cms-dev.<domain>` | delegate a subdomain to Route 53 | phase 2 |
| Q4 | `dev` exposure | NLB allowlist of office/VPN CIDRs | phase 2 |
| Q5 | Captioning endpoint | media-worker runs with placeholder endpoint `http://llm.invalid/v1` (consumes events, skips the caption call for the `.invalid` host, nothing written back) until the title bug is fixed; then an external OpenAI-compatible endpoint (key in Secrets Manager) or a small in-cluster Ollama vision model as an optional component; Bedrock would need a code change | phase 2 |
| Q6 | Load generator in `dev` | on, 1 replica, 10 users; revisit after the first week's cost | phase 2 |
| Q7 | Container log path on EKS | **decided 2026-11-02 (owner)**: agent → Coralogix directly, the chart's default; no Kafka topic or `otel-gateway` for logs | phase 2 |
| Q8 | Argo CD UI access | `kubectl port-forward` in `dev`; route + SSO in phase 4 | phase 2 |
| Q9 | Owner tag and alert recipients | repository owner | phase 2 |
| Q10 | Approval for phase 3 application changes and the .NET 10 upgrade | approved as tracked work | phase 3 |

## Prerequisites

- **Tools** (host today → required): Terraform 1.6.2 → ≥ 1.10 (CI 1.17.x); kubectl 1.34.1 → ≥ 1.36; AWS CLI 2.13.26 → current v2; Helm 3.11.3 → current (local rendering only); add `kustomize` 5.x, `argocd` CLI 3.5.x, `docker buildx`.
- **Docker Desktop**: ≥ 6 CPUs, ≥ 12 GiB memory, ≥ 100 GB disk; prune build cache routinely.
- **GitHub**: Actions enabled; environments `dev` and `prod` with required reviewers; branch protection on `main`; secret scanning and push protection on (public repository); a GitHub App (contents + pull-requests write) for promotion PRs; larger arm64 runners optional (standard ones need the `ci` profile).
- **AWS** (phase 2): account access via IAM Identity Center, hosted zone (Q3), service quotas for MSK and EIPs checked in `eu-west-1`.
