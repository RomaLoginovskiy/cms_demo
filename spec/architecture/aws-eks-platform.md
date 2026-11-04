# AWS EKS Platform Architecture

**Status**: Proposed (2026-10-30)  
**Decisions**: [ADR-017](../adr/ADR-017-aws-eks-gitops-platform.md) · [ADR-018](../adr/ADR-018-eks-edge-routing-gateway-api.md) · [ADR-019](../adr/ADR-019-workload-identity-irsa.md) · [ADR-020](../adr/ADR-020-aws-data-services-mapping.md)  
**Components**: [terraform-infrastructure.md](../components/terraform-infrastructure.md) · [gitops-argocd.md](../components/gitops-argocd.md) · [floci-local-environment.md](../components/floci-local-environment.md) · [cms-demo-workload-contract.md](../components/cms-demo-workload-contract.md)  
**Plan**: [aws-eks-delivery-plan.md](aws-eks-delivery-plan.md)

## 1. Goals and non-goals

Goals:

- Run the whole stack (CMS API, media worker, CMS UI, canvas API with SignalR, canvas UI, browser load generator, Coralogix telemetry) on Amazon EKS.
- Terraform creates all AWS resources; Argo CD applies all in-cluster state; nothing is changed by hand.
- The same Terraform modules and the same Argo CD manifests run against floci on a laptop and in CI.
- No static AWS credentials anywhere; no secrets in the public Git repository.

Non-goals (this iteration): multi-region, multi-cluster per environment, service mesh, WAF, horizontal scaling of stateful tiers before ADR-020 phase 3–4.

## 2. System context (AWS `dev`)

```
                    Browser (RUM SDK)                       Coralogix EU1 (eu-west-1)
                          │ HTTPS                                  ▲ OTLP / logs
                          ▼                                        │
  Route 53 ── cms-dev.<domain> ──▶ NLB (TLS, ACM cert, SG allowlist)
                          │ (proxy protocol, IP targets)
 ┌────────────────────────┼──────────────── VPC 10.20.0.0/16, eu-west-1a/b/c ───────────────┐
 │ public subnets ×3: NLB nodes, NAT GW                                                     │
 │ private subnets ×3: EKS managed node group (Graviton, AL2023)                            │
 │  ┌──────────────────────────────── EKS cms-dev (1.37) ───────────────────────────────┐  │
 │  │ edge:          Envoy Gateway proxies (Gateway "cms-edge")                          │  │
 │  │ cms-demo:      canvas-frontend  cms-frontend  canvas-backend  cms-backend          │  │
 │  │                media-worker     canvas-load   kafka-topics Job                      │  │
 │  │ observability: Coralogix agent DaemonSet (hostPort 4318), cluster collector        │──┼─▶ Coralogix
 │  │ platform:      argocd, external-secrets, envoy-gateway-system, aws-lb-controller,  │  │
 │  │                metrics-server                                                       │  │
 │  └──────┬───────────────────────┬───────────────────────────┬────────────────────────┘  │
 │         │ EBS gp3 (SQLite, media)│ Kafka 9092                │ IRSA (STS)               │
 │  intra subnets ×3:      MSK (2 brokers)        [phase 3: RDS PostgreSQL, OpenSearch]     │
 └─────────┼────────────────────────────────────────────────────────────────────────────────┘
           ▼
  Regional services: ECR · Secrets Manager · SSM Parameter Store · KMS · CloudWatch Logs · AWS Backup · S3 (phase 3)
  GitHub (public repo) ◀── Argo CD polls/webhook        GitHub Actions ──OIDC──▶ ECR push, Terraform plan/apply
```

The `local` environment has the same shape inside Docker; see [floci-local-environment.md](../components/floci-local-environment.md#topology).

## 3. Environments

| | `local` | `dev` | `prod` (phase 4) |
|---|---|---|---|
| Runtime | floci 2.3.0 on Docker Desktop (arm64) | AWS | AWS |
| Account | `000000000000` (emulated) | dev account (Q1) | separate prod account (recommended) |
| Region | `eu-west-1` (floci default region overridden) | `eu-west-1` | `eu-west-1` |
| Cluster | `cms-local`, 1 k3s node | `cms-dev`, 2× m7g.xlarge in AZs a/b | `cms-prod`, 3× m7g.xlarge across 3 AZs |
| VPC CIDR | 10.10.0.0/16 (records only) | 10.20.0.0/16 | 10.30.0.0/16 |
| Service CIDR | 10.100.0.0/16 | 10.100.0.0/16 | 10.100.0.0/16 |
| Public entry | `http://localhost:8080` | `https://cms-dev.<domain>` (Q3), allowlisted (Q4) | `https://cms.<domain>` |
| Kafka | floci MSK (Redpanda) | MSK 2 brokers in AZs a/b, `TLS_PLAINTEXT` | MSK 3 brokers, TLS + IAM |
| SQL / media | local-path PVCs | EBS gp3 PVCs | RDS Multi-AZ + S3 (ADR-020 phase 3) |
| Load generator | on, targets the in-cluster Gateway | on (Q6), targets the public hostname; admin UI via port-forward only | off |
| Git revision tracked | developer branch | `main` | release tags / `main` with manual promotion |

## 4. Network

- **Subnets** (per AZ a/b/c): public `/24` (10.20.0–2.0), private `/19` (10.20.32.0, .64.0, .96.0) for nodes and VPC-CNI pod IPs, intra `/24` (10.20.10–12.0) for MSK/RDS/OpenSearch with no internet route. In `dev`, MSK uses the a/b intra subnets (broker count must be a multiple of its subnets).
- **Egress**: one NAT gateway in `dev` (cost), one per AZ in `prod`.
- **Endpoints**: S3 gateway endpoint everywhere (free). Interface endpoints (ECR api/dkr, STS, Secrets Manager, SSM, Logs) only in `prod`.
- **Subnet tags**: `kubernetes.io/role/elb=1` (public), `kubernetes.io/role/internal-elb=1` (private) for AWS LBC discovery.
- **Security groups**: cluster SG + node SG from the EKS module; MSK SG allows 9092/9094 only from the node SG; RDS/OpenSearch SGs likewise (phase 3). NLB source ranges come from the `public_ingress_cidrs` cluster annotation (Q4 allowlist plus the NAT gateway EIPs, so the load generator can hairpin through the public hostname) and are applied by AWS LBC from `loadBalancerSourceRanges`; Terraform owns no NLB security group.
- **Cluster endpoint**: public endpoint restricted to `admin_cidrs` plus private endpoint. CI never needs the Kubernetes API (it only talks to AWS APIs and Git); the rarely-changed Terraform `gitops` layer is applied by an operator from an allowed CIDR.

## 5. EKS cluster

- Version **1.37** (standard support until about December 2027; fallback 1.36 everywhere if floci's k3s 1.37 misbehaves), `API` authentication mode, cluster-creator admin for the Terraform role, access entries for a human admin role (`AmazonEKSClusterAdminPolicy`) and a read-only role (`AmazonEKSViewPolicy`).
- KMS envelope encryption of Secrets; control-plane logs `api`, `audit`, `authenticator` to CloudWatch (30-day retention).
- **Node group `default`**: `AL2023_ARM_64_STANDARD`, `m7g.xlarge` (4 vCPU / 16 GiB), min 2 / desired 2 / max 3 in `dev`, gp3 50 GiB root, IMDSv2 required with hop limit 1, private subnets in AZs a and b only (the same AZs as MSK; EBS-backed stateful pods stay in their volume's AZ, and the managed node group keeps one node per AZ). No cluster autoscaler in `dev` (fixed size); Karpenter or Cluster Autoscaler is a phase-4 decision. Sizing basis: app requests ≈ 1.5 vCPU / 1.8 GiB plus the load generator's burst (up to 4 vCPU), platform ≈ 1.5 vCPU / 2.5 GiB, DaemonSets ≈ 0.6 vCPU / 1.2 GiB per node.
- **EKS-managed add-ons (Terraform)**: `vpc-cni` (configured with `enableNetworkPolicy: "true"`, installed before nodes), `coredns`, `kube-proxy`, `aws-ebs-csi-driver` (IRSA role). On floci these are recorded metadata; k3s supplies flannel, CoreDNS and kube-proxy itself.

### Namespaces and Pod Security Admission

| Namespace | Contents | PSA `enforce` |
|---|---|---|
| `argocd` | Argo CD | `baseline` |
| `external-secrets` | ESO | `restricted` |
| `envoy-gateway-system` | Envoy Gateway controller | `baseline` |
| `edge` | `Gateway cms-edge`, Envoy proxy pods | `baseline` |
| `observability` | Coralogix otel-integration, `otel-agent` Service, `/v1/traces` route, kube-state-metrics, Node Exporter | `privileged` (hostPath, eBPF profiler) |
| `cms-demo` | application (namespace name kept: the load generator hard-codes it) | `baseline`, `warn: restricted` |
| `kube-system` | EKS add-ons, AWS LBC, metrics-server | — |

## 6. Platform add-ons

| Component | Version line (2026-10) | Installed by | Environments | AWS identity |
|---|---|---|---|---|
| Argo CD | 3.5.x (chart `argo-cd` 10.11.x) | Terraform bootstrap, then self-managed by Argo CD | all | none |
| `namespaces` (Namespaces with PSA and route labels) | — | Argo CD | all | — |
| External Secrets Operator | 2.14.x | Argo CD | all | IRSA via JWT auth: `eso-app`, `eso-observability` (ADR-019) |
| Stakater Reloader | current | Argo CD | all | none; restarts workloads when an ESO-managed Secret changes |
| Envoy Gateway + Gateway API CRDs (`gateway-crds-helm`, standard channel) | 1.9.x | Argo CD | all | none |
| AWS Load Balancer Controller | 3.6.x; `clusterName`/`vpcId`/`region` set from cluster annotations (no IMDS at hop limit 1); Gateway API feature gates **off**; `ignoreDifferences` on its render-time webhook certificate | Argo CD | AWS | IRSA |
| metrics-server | current | Argo CD | AWS only (k3s bundles its own) | none |
| kube-state-metrics (chart 8.8.x, allowlisted; scraped by the Coralogix cluster collector) | 2.20.x | Argo CD | all | none |
| Node Exporter (chart `prometheus-node-exporter` 4.60.x, hostNetwork; scraped by the Coralogix cluster collector) | 1.12.x | Argo CD | all | none |
| external-dns | 0.24.x, source `gateway-httproute`, one zone | Argo CD | AWS (mandatory: owns the public record) | IRSA |
| Coralogix `otel-integration` | pinned at implementation | Argo CD (Kustomize `helmCharts`) | all | none |
| StorageClass `gp3` (default, encrypted, `WaitForFirstConsumer`) | — | Argo CD | AWS | — |

Versions are pinned exactly in Git; upgrades are pull requests, tested on `local` first.

## 7. Traffic flow

1. Browser → Route 53 (alias record maintained by external-dns) → NLB `:443` (TLS terminated with the ACM certificate) → Envoy proxy pod (IP target, proxy protocol v2 for client IP). `:80` lands on a redirect-only Gateway listener.
2. Envoy matches `HTTPRoute`s (ADR-018): `/api/boards`, `/hubs` → `canvas-backend`; `/api/media`, `/api` → `cms-backend`; `/v1/traces` → `otel-agent` (observability namespace); `/cms` → `cms-frontend`; `/` → `canvas-frontend`. The load generator's admin UI is not routed (port-forward only).
3. Backends emit OTLP to `http://$(NODE):4318` (agent hostPort); the agent forwards to Coralogix. Container logs also go straight from the agent to Coralogix, the chart's default path (Q7, decided 2026-11-02); there is no Kafka hop and no `otel-gateway`.
4. `cms-backend` publishes `media.uploaded` to MSK; `media-worker` consumes, fetches the file from `http://cms-backend:8080`, calls the captioning endpoint, PUTs the description back.

## 8. Identity and access

- **Workloads**: IRSA everywhere (ADR-019). Roles: `eso-app` (read secrets `cms-demo/<env>/coralogix-rum` and `cms-demo/<env>/llm`, parameters `/cms-demo/<env>/{kafka,app,llm}/*`, decrypt with the app KMS key), `eso-observability` (read secret `cms-demo/<env>/coralogix-ingest` and `/cms-demo/<env>/kafka/*`), `aws-load-balancer-controller` (AWS-published policy), `ebs-csi-driver` (AWS managed policy), `external-dns` (one hosted zone), phase 3: `cms-backend` (S3 media bucket prefix).
- **Humans**: EKS access entries mapped to IAM Identity Center permission-set roles; Argo CD UI via SSO (GitHub or Identity Center OIDC through Dex) before `prod`; until SSO lands (phase 4) the local admin account stays enabled but the UI is reachable only through `kubectl port-forward`.
- **CI**: GitHub OIDC provider in each AWS account; roles `cms-demo-gha-ecr-push` (push to `cms-demo/*` repositories), `cms-demo-gha-tf-plan` (read-only, state read, and `s3:PutObject`/`s3:DeleteObject` on `*.tflock` because `plan` takes the S3 lock), `cms-demo-gha-tf-apply` (used only by the protected `dev`/`prod` GitHub environments). Trust policies pin `repo:RomaLoginovskiy/cms_demo` and the branch or environment.

## 9. Configuration and secrets flow

```
 Terraform ──writes──▶ SSM /cms-demo/<env>/...  (endpoints, names, flags)
     │                 Secrets Manager cms-demo/<env>/... (containers; values set out of band)
     │                 Argo CD cluster Secret annotations (role ARNs, cert ARN, account, region, VPC)
     ▼
 Argo CD ApplicationSets ──template──▶ Helm values / Kustomize patches (from annotations)
 External Secrets Operator ──sync──▶ Secret / ConfigMap in cms-demo, observability
 Pods ──env──▶ ASP.NET (__ separators), nginx runtime-env.js, OTel collectors
```

Rules:

- Secret **values** never pass through Terraform state or Git: Terraform creates each secret with a non-empty placeholder version (`lifecycle.ignore_changes` on the value) and its IAM policy; an operator (or `make local-secrets` from a gitignored file) writes the real value. Placeholders keep every ExternalSecret resolvable, so a missing value never blocks the first sync; Reloader rolls the consumers when the real value arrives.
- The Coralogix RUM public key is browser-visible by design, but it moves out of the manifests into Secrets Manager anyway, because it is environment-specific and the repo is public.
- Parameter and secret naming is defined in [terraform-infrastructure.md](../components/terraform-infrastructure.md#outputs-contract).

## 10. Observability on EKS

- Coralogix `otel-integration` in `observability`, `global.domain: ${env:CORALOGIX_DOMAIN}` (the region comes with the ingest key: property `DOMAIN` of `cms-demo/<env>/coralogix-ingest`), `global.clusterName` = cluster name (`cms-dev`), values from `coralogix/values.yaml` split into common + per-environment files.
- The Docker Desktop post-renderer (`mountPropagation: HostToContainer` → `None`) is applied **only** in the `local` overlay as Kustomize patches (spike S6); EKS nodes support `HostToContainer`.
- Agent hostPort 4318 must be present in the rendered DaemonSet (ADR-016 follow-up); VPC CNI supports hostPort through its portmap plugin.
- With IMDS hop limit 1, the `ec2`/`eks` resource detectors cannot reach IMDS from pod network namespaces: keep `resourceDetection` limited to Kubernetes attributes, or accept hostNetwork for the agent. Decided in spike S6.
- Telemetry does not depend on Kafka: logs, metrics, traces and profiles leave the node agent for Coralogix directly, so `observability` reads only the Coralogix ingest key (no SSM parameters). Kafka carries application events only.
- eBPF profiling uses the chart's `opentelemetry-ebpf-profiler` (otelcol-ebpf-profiler distribution, same version as the collectors) feeding the agent's `profilesCollection`. The legacy `coralogix-ebpf-profiler` still bundled in chart 0.0.371 speaks an older OTLP profiles protocol than its collectors (`proto: wrong wireType = 2 for field LinkIndex`). The profiler cannot run on floci (G17).
- EKS control-plane logs stay in CloudWatch (optional later: forward to Coralogix via Firehose).
- `prod` option: Coralogix AWS PrivateLink in `eu-west-1` to keep telemetry off the internet.

## 11. Security baseline

- [ ] No static AWS keys: IRSA for pods, OIDC for CI, IAM Identity Center for humans.
- [ ] Secrets only in Secrets Manager (KMS-encrypted); gitleaks in CI and GitHub push protection on the public repo.
- [ ] EKS Secrets envelope encryption; control-plane audit logging.
- [ ] Nodes in private subnets, IMDSv2 required, hop limit 1, SSM Session Manager instead of SSH.
- [ ] ECR: immutable tags, scan on push, lifecycle policy; CI image scan (Trivy) blocks critical CVEs.
- [ ] PSA labels per namespace (section 5); default-deny ingress NetworkPolicy in `cms-demo` with explicit allows from `edge` and intra-namespace callers (enforced by the VPC CNI policy agent on EKS and by k3s on floci).
- [ ] Load-generator control API (unauthenticated, can steer browsers to any URL) never routed: Service `ClusterIP`, `kubectl port-forward` only.
- [ ] ClusterSecretStores restricted with namespace `conditions`; the Coralogix ingest key is readable only from `observability`.
- [ ] Argo CD: AppProjects restrict source repo, destinations and cluster-scoped kinds; automated sync with `selfHeal` so manual drift is reverted.
- [ ] MSK/RDS/OpenSearch reachable only from the node SG; plaintext Kafka accepted in `dev` only (ADR-020).

## 12. Delivery pipeline

```
 pull request ─▶ ci.yml     .NET build+test, npm test, docker build (arm64), hadolint, Trivy,
                            kustomize build + kubeconform on deploy/, terraform fmt/validate/tflint,
                            gitleaks; floci e2e on label "e2e" and nightly (ubuntu-24.04-arm)
 merge to main ─▶ images.yml  build 6 images (linux/arm64) → ECR via OIDC, tag sha-<12>; skip tags that
                            already exist (ECR tags are immutable, re-push is rejected)
              └▶ promote-dev  PR "deploy(dev): sha-<12>" opened with a GitHub App token (PRs created
                            with GITHUB_TOKEN trigger no CI) edits overlays/dev → auto-merge
 Argo CD (dev) ─▶ polls Git every 3 min (no inbound webhook while the UI is private) → sync → health gates
 prod promotion ─▶ manual PR copying tags dev → prod overlay, required review
 infrastructure ─▶ terraform.yml  plan on PR (local root against floci; dev with plan role),
                                  apply dev on merge after GitHub environment approval
```

## 13. Cost estimate (`dev`, eu-west-1, on-demand, approximate)

| Item | Basis | USD / month |
|---|---|---|
| EKS control plane | standard support, USD 0.10/h | 73 |
| Worker nodes | 2× m7g.xlarge | ~260 |
| MSK | 2× kafka.t3.small + 2× 20 GiB | ~75 |
| NAT gateway | 1, excluding data processing | ~35 |
| NLB | 1, low traffic | ~20 |
| Public IPv4 addresses | NAT + NLB (3 AZs) | ~15 |
| EBS | 2× 50 GiB root + 12 GiB PVCs, snapshots | ~12 |
| CloudWatch Logs | control-plane logs | 5–15 |
| KMS, Secrets Manager, Route 53, ECR | small fixed fees | ~5 |
| **Total phase 1–2** | | **≈ 500–520** |
| Phase 3 additions | RDS db.t4g.micro single-AZ, S3, optional OpenSearch t3.small.search | +15 to +45 |

Levers: Spot capacity for `dev` nodes (largest saving), scheduled scale-down of the node group out of hours, Compute Savings Plan for `prod`. An AWS Budgets alarm at 80 % and 100 % of USD 600 is part of the `dev` Terraform. Figures are estimates to be confirmed in the AWS Pricing Calculator.

## 14. Risks

| ID | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | floci fidelity gaps or regressions hide or invent failures | M / M | pin 2.3.0; spikes S1–S8; every change validated on `dev` before `prod` |
| R2 | EBS-backed SQLite pins two APIs to one AZ | M / M (`dev`) | accepted for `dev`; ADR-020 phase 3 removes it |
| R3 | Secret leaked to the public repo | L / H | Secrets Manager only, gitleaks, push protection, ESO |
| R4 | Plaintext Kafka inside the VPC | M / M | SG-restricted; TLS in phase 3.1 before `prod` |
| R5 | MSK t3.small throughput saturated by the log pipeline | M / M | monitor bytes-in; Q7 (direct export) |
| R6 | Load generator cost and synthetic RUM volume | M / L | replicas and schedule per overlay; off in `prod` |
| R7 | Manual cluster changes drift from Git | M / M | Argo CD `selfHeal`; read-only human access in `prod` |
| R8 | Coralogix chart incompatibilities on k3s-in-Docker | M / L | local-only patches (S6); EKS path unaffected |
| R9 | Gateway API CRD version skew between Envoy Gateway and AWS LBC | L / M | LBC Gateway features off; CRDs owned by the Envoy Gateway chart |
| R10 | Cost overrun | L / M | Budgets alarm, Spot for `dev` |
