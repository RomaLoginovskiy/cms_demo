# Component: floci Local AWS Environment

**Status**: Proposed (2026-10-30)  
**Decision**: [ADR-017](../adr/ADR-017-aws-eks-gitops-platform.md)  
**Related**: [terraform-infrastructure.md](terraform-infrastructure.md), [gitops-argocd.md](gitops-argocd.md), [aws-eks-platform.md](../architecture/aws-eks-platform.md)

## Purpose

Run the **same Terraform roots and the same Argo CD manifests** that target AWS against a local AWS emulator, so infrastructure changes, GitOps wiring and the application can be exercised on a laptop and in CI without an AWS account. The emulator is [floci](https://github.com/floci-io/floci) (MIT, single endpoint on port 4566).

Non-goals: load or performance testing, HA/failover behaviour, IAM least-privilege sign-off for production (see fidelity gaps).

## What floci provides for this project

| AWS service | floci mode | What actually runs | Used for |
|---|---|---|---|
| EKS | real (default) | one privileged `rancher/k3s` container per cluster, API server on host port 6500–6599 | the `local` cluster |
| ECR | real | shared `registry:2` container, proxied through `:4566` | image push/pull; k3s gets a generated `registries.yaml` mirror |
| IAM / STS | in-process | users, roles, OIDC providers; `AssumeRoleWithWebIdentity` verifies k3s-signed tokens | IRSA (ADR-019), Terraform identity |
| Secrets Manager / SSM | in-process | versioned secrets and parameters | ESO source of truth |
| KMS | in-process | keys, aliases, encrypt/decrypt | key resources referenced by Terraform |
| EC2 / VPC | in-process records + Docker for instances | VPC, subnets, route tables, NAT/IGW/endpoint **records** | `network` module applies unchanged |
| S3 / DynamoDB | in-process | buckets, objects; tables | Terraform state + lock; phase 3 media bucket |
| MSK | real | one `redpandadata/redpanda` container per cluster, PLAINTEXT only | Kafka (ADR-020) |
| RDS | real | `postgres:16-alpine` container behind a floci TCP proxy (7001–7099) | phase 3 database (ADR-020) |
| OpenSearch | real | `opensearchproject/opensearch` or `elasticsearch-oss:7.10.2` container, port 9400–9499 | search, if enabled (ADR-020) |
| Route 53 / ACM | in-process | zones and records (private zones resolvable by k3s through floci DNS); certificates auto-issued by the floci local CA | DNS/TLS resources apply unchanged |

## Pinned versions and host requirements

| Item | Pin | Why |
|---|---|---|
| floci image | `floci/floci:2.3.0` (2026-10-15) | releases ship twice a month; never use `latest` |
| k3s image | resolved by floci from the EKS version requested: `1.37` → `rancher/k3s:v1.37.0-k3s1` (`1.36` is the newest pinned mapping and the fallback) | must equal the AWS cluster minor |
| Terraform | ≥ 1.10 (current 1.17.x); host currently has 1.6.2 | S3 lockfile, floci compat suite targets 1.10+ |
| kubectl | within ±1 minor of the cluster (host has 1.34) | version-skew policy |
| AWS CLI | v2 current | bootstrap scripts |
| Docker Desktop | ≥ 6 CPUs, ≥ 12 GiB RAM, ≥ 100 GB disk | k3s + Redpanda + Postgres + OpenSearch + app + Argo CD; build cache fills the VM disk quickly, so prune it regularly |

The host is Apple Silicon (arm64): floci, k3s and all app images run as `linux/arm64` locally, which is why AWS nodes are Graviton (see [aws-eks-platform.md](../architecture/aws-eks-platform.md)).

## Topology

```
 macOS host
 ├─ terraform / aws / kubectl / docker CLIs
 │     │ http://localhost:4566 (AWS APIs + ECR)      https://localhost:65xx (k3s API)
 ▼     ▼                                              ▼
 Docker network "cms-local" (user-defined, fixed subnet)
 ┌──────────────┐   spawns   ┌───────────────────────┐   ┌──────────────────────┐
 │ floci :4566  │──────────▶│ floci-eks-cms-local    │   │ floci-ecr-registry    │
 │ DNS :53/udp  │           │ (k3s server+agent)     │◀──│ registry:2            │
 │ RDS proxy    │           │  argocd, envoy-gateway │   └──────────────────────┘
 │ 7001-7099    │           │  eso, otel, cms-demo   │   ┌──────────────────────┐
 └──────────────┘           └──────────▲────────────┘   │ redpanda (MSK)        │
        ▲                              │ :80/:443      │ postgres (RDS)        │
        │ docker.sock                  │ (ServiceLB)   │ opensearch (optional) │
 ┌──────┴───────┐           ┌──────────┴────────────┐   └──────────────────────┘
 │ Docker engine │          │ edge (socat)           │──▶ host localhost:8080
 └──────────────┘           └───────────────────────┘
```

## Compose definition (reference)

Lives at `infra/local/docker-compose.yml` (abbreviated here):

```yaml
name: cms-local
networks:
  cms-local:
    name: cms-local
    ipam:
      config: [{ subnet: 172.30.0.0/16 }]   # avoids Docker Desktop defaults and k3s 10.42/10.43
services:
  floci:
    image: floci/floci:2.3.0
    ports:
      - "4566:4566"
      - "7001-7010:7001-7010"     # RDS proxy (host access for psql/migrations)
      - "5353:53/udp"             # optional: query floci DNS from the host
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - floci-data:/app/data
    networks:
      cms-local: { ipv4_address: 172.30.0.10 }   # stable address for CoreDNS fallbacks
    environment:
      FLOCI_DEFAULT_REGION: eu-west-1
      FLOCI_HOSTNAME: floci
      FLOCI_STORAGE_MODE: hybrid                  # stock image defaults to memory; clusters must survive restarts
      FLOCI_STORAGE_PERSISTENT_PATH: /app/data
      FLOCI_SERVICES_DOCKER_NETWORK: cms-local
      FLOCI_SERVICES_EKS_DEFAULT_STORAGE_CLASS: "true"   # keep k3s local-path (EBS CSI add-on is metadata only)
      FLOCI_SERVICES_EKS_ENDPOINT_MODE: host              # DescribeCluster returns https://localhost:<port> for host-side kubectl/Terraform
      FLOCI_SERVICES_EKS_MAX_VCPUS: "6"
      FLOCI_SERVICES_EKS_MAX_MEMORY_MIB: "10240"
      FLOCI_SERVICES_ECR_URI_STYLE: path          # containerd image store refuses plain-HTTP *.localhost
      FLOCI_SERVICES_IAM_ENFORCEMENT_ENABLED: "${FLOCI_IAM_ENFORCEMENT:-false}"
      FLOCI_SERVICES_UI_ENABLED: "false"
  edge:
    image: alpine/socat:1.8.0.3
    # Gateway listener "websecure" (443) speaks plain HTTP: TLS is only terminated by the NLB on AWS (ADR-018)
    # EDGE_TARGET is resolved by `make local-edge` from the container label io.floci.resource-id=cms-local
    # (floci names it floci-aws-eks-cms-local; older builds used floci-eks-cms-local)
    command: tcp-listen:8080,fork,reuseaddr tcp-connect:${EDGE_TARGET:?run make local-edge}:443
    ports: ["8080:8080"]
    networks: [cms-local]
    profiles: [app]          # started after the cluster exists
volumes:
  floci-data:
```

Rationale for non-obvious settings:

- `FLOCI_HOSTNAME=floci` makes floci embed a resolvable name in returned URLs (SQS queue URLs, presigned URLs, callbacks) instead of `localhost`. RDS endpoints are governed separately by `FLOCI_SERVICES_RDS_ENDPOINT_HOST` (phase 3).
- `FLOCI_SERVICES_ECR_URI_STYLE=path` yields `localhost:4566/<account>/<region>/<repo>`. Docker Engine 29+ (containerd image store) only treats `localhost`/`127.0.0.1` as plain-HTTP registries; floci's k3s mirror covers the path form, so the same reference works for host push and in-cluster pull.
- `FLOCI_STORAGE_MODE=hybrid`: EKS clusters, ECR repositories and RDS instances are re-latched to their containers on restart only with a persistent mode.

## Bootstrap sequence

Exposed as `make` targets in the root `Makefile` (`infra/mk/local.mk`, scripts in `infra/local/scripts/`; idempotent, re-runnable):

| Step | Target | What it does |
|---|---|---|
| 1 | `local-up` | `docker compose up -d floci`; wait for `/_floci/health` (or a `sts get-caller-identity` probe) |
| 2 | `local-identity` | with `test/test`: create IAM user `local-admin`, attach `AdministratorAccess`, create an access key, write AWS CLI profile `cms-local` to `infra/local/.aws/` (gitignored). EKS token auth **rejects** `test/test` and `floci/floci`, so this step is mandatory |
| 3 | `local-state` | create S3 bucket `cms-demo-tfstate-local` and DynamoDB table `cms-demo-tflock-local` (floci's documented backend pattern) |
| 4 | `local-apply-global` | apply `stacks/global` with `envs/local`: ECR repositories `cms-demo/*` |
| 5 | `local-images` | `aws ecr get-login-password \| docker login localhost:4566`; build all six images for `linux/arm64`; push with a unique tag (`sha-<12>`, plus `-dirty-<epoch>` for uncommitted trees); tags already in the repository are skipped, because IMMUTABLE repositories reject even an identical re-push |
| 6 | `local-apply` | apply `stacks/infra` with `envs/local` (network, eks, msk, app-config) |
| 7 | `local-secrets` | write Coralogix and LLM secret values from gitignored `infra/local/.secrets.env` into floci Secrets Manager; without that file the Terraform placeholders stay (RUM off, telemetry export rejected, captioning disabled) |
| 8 | `local-gitops` | write `infra/local/.kubeconfig`, apply the CoreDNS import `infra/local/k8s/coredns-custom.yaml` (G16), apply `stacks/gitops` with `envs/local` (Argo CD, cluster Secret, root Application; source: working-tree snapshot on the local Git mirror), then set `image_tag_override` to the tag from step 5 |
| 9 | `local-kubeconfig` | `aws eks update-kubeconfig --name cms-local --alias cms-local` (exec token through floci's webhook) |
| 10 | `local-edge` | find the k3s container by label (`docker ps --filter label=io.floci.resource-id=cms-local`), start `edge` with `EDGE_TARGET` set; print `http://localhost:8080` and the Argo CD port-forward command |
| — | `local-down` / `local-nuke` | stop containers keeping volumes / delete clusters, volumes and state |

`make local-all` runs 1–10. Images are pushed before the first sync only to shorten convergence; Argo CD retries, so the order is an optimisation, not a correctness requirement. Container names are never hard-coded: floci moved spawned containers to the `floci-aws-<service>-…` prefix, so scripts resolve them by `io.floci.*` labels (confirmed in spike S1). `make local-retarget BRANCH=<name>` and `make predestroy ENV=local` complete the target set.

## Endpoints and credentials inside the cluster

- Pods reach floci at `http://floci:4566`. floci starts the k3s container with `--dns 172.30.0.10` (its embedded DNS), but Docker answers from its own resolver at `127.0.0.11`; k3s treats that loopback address as unusable and hands CoreDNS `8.8.8.8` instead, so out of the box pods resolve neither `floci` nor floci's containers (**spike S2**, gap G16). `make local-gitops` therefore applies `infra/local/k8s/coredns-custom.yaml`, a k3s CoreDNS import that forwards every non-cluster name to `172.30.0.10`, which answers `floci`, every container on `cms-local` and public names. A static `hosts` entry would not be enough: Redpanda advertises its broker as `floci-aws-msk-<id>:9092`, a name that changes with each MSK cluster.
- AWS SDK endpoint overrides are injected only by the `local` overlay (`AWS_ENDPOINT_URL=http://floci:4566` plus service-specific variants where an SDK or chart needs them). Base manifests never contain floci addresses.
- Service coordinates (RDS host/port, Kafka bootstrap, bucket names) are not hard-coded per environment: Terraform writes them to SSM/Secrets Manager and ESO renders them (see [terraform-infrastructure.md](terraform-infrastructure.md#outputs-contract)). On floci the values are container addresses on `cms-local`.
- IRSA works as on EKS (ADR-019). Terraform builds the OIDC provider from the issuer that floci's `DescribeCluster` returns.

## Argo CD on floci

- Argo CD reads a **local Git mirror** by default: a rootless Gitea container (`cms-local-git`, `172.30.0.11:3000`, anonymous read) on the `cms-local` network. `make local-sync` (also run by `make local-gitops`) commits a snapshot of the working tree, tracked and untracked files honouring `.gitignore`, through a temporary index and force-pushes it to branch `local`. Your index, `HEAD` and branches are untouched, and nothing is published, so unpushed work can be tested end to end. The sync then asks Argo CD to refresh every Application.
- The mirror URL is a fixed IP, so Argo CD does not depend on pod DNS for its source; both AppProjects allow it next to the GitHub URL.
- `make local-sync` also terminates syncs that are retrying: an automated sync retry stays pinned to the revision it started with, so after a fix it would keep failing on the old snapshot.
- `make local-retarget BRANCH=<pushed branch>` switches the root app and all ApplicationSets to GitHub (`BRANCH=local` switches back); `GITOPS_SOURCE=github make local-gitops` bootstraps from GitHub directly.
- Pre-sync checks use `make deploy-render` (Kustomize) against the working tree.

## Fidelity gaps and mitigations

| # | Gap on floci | Consequence | Mitigation |
|---|---|---|---|
| G1 | Single k3s node; node groups are metadata (first group's instance type sets the container's CPU/RAM) | No multi-node scheduling, AZ spread, PDB or autoscaling behaviour | Validate on `dev`; keep topology rules simple in phase 1 |
| G2 | EKS add-ons are metadata only (VPC CNI, EBS CSI, Pod Identity agent not installed) | Storage class is `local-path` (not `gp3`); CNI is flannel | PVCs never set `storageClassName`; each environment provides a default class |
| G3 | NetworkPolicy enforced by k3s' embedded controller, not the VPC CNI policy agent | Same API, minor semantic differences | Keep policies to standard `NetworkPolicy` fields; re-verify on `dev` |
| G4 | No ELB data plane for pod targets; AWS LBC not installed | NLB/TLS edge not tested locally | Envoy routes identical (ADR-018); NLB verified on `dev` |
| G5 | Access entries/policies stored, not enforced; IAM principals are cluster-admin | Kubernetes RBAC for humans not tested | Access-entry tests on `dev` |
| G6 | IAM policies not evaluated unless `FLOCI_SERVICES_IAM_ENFORCEMENT_ENABLED=true` | Least-privilege mistakes hidden | Run CI acceptance with enforcement on; IAM Access Analyzer `validate-policy` in CI |
| G7 | MSK = Redpanda, PLAINTEXT only, SASL/IAM not enforced | Kafka auth/TLS config differs from AWS | Security protocol is config, set per overlay (ADR-020) |
| G8 | `UpdateClusterVersion` / node group updates not implemented | Upgrades cannot be rehearsed | Upgrade runbook exercised on `dev` |
| G9 | ECR scanning, lifecycle, replication not enforced | Image hygiene not tested | Enforced on AWS only; CI scans images (Trivy/Grype) before push |
| G10 | KMS envelope encryption recorded only; control-plane logging covers `api` and `audit` streams into floci CloudWatch Logs (single k3s stream set, no per-component streams) | Encryption effect absent; log layout differs | Verified on `dev` |
| G11 | ACM certificates signed by the floci local CA; no public DNS | No public HTTPS locally | Local edge is plain HTTP on `localhost:8080` |
| G12 | Emulator bugs/regressions between releases | Flaky local runs | Pin image; upgrade deliberately with the compat smoke suite |
| G13 | No AWS public SSM parameters (`/aws/service/eks/optimized-ami/...`) | terraform-aws-modules/eks reads them when `use_latest_ami_release_version` is on, and plan fails (found in spike S7) | Node group sets `use_latest_ami_release_version = false` in every environment: EKS picks the AMI, AMI rolls stay explicit |
| G14 | `AssociateAccessPolicy` fails for IAM user ARNs (`UnknownOperationException` on `.../access-entries/<arn>/access-policies`); access entries are not enforced anyway | Creator admin entry cannot be created | `eks` module skips the creator entry when `emulator = floci` (IAM callers are cluster-admin on floci) |
| G15 | Add-on version catalog only covers Kubernetes 1.28–1.32 (`DescribeAddonVersions` empty for 1.33+) | `aws_eks_addon_version` lookups fail for current versions | `eks` module declares no EKS-managed add-ons when `emulator = floci` (they are metadata only there, G2) |
| G16 | Pods cannot resolve `floci` or floci's containers: k3s swaps Docker's loopback resolver for `8.8.8.8` | ESO cannot reach STS; Kafka clients cannot reach the broker name MSK advertises | CoreDNS import forwarding to floci's DNS (`infra/local/k8s/coredns-custom.yaml`, applied by `local-gitops`) |
| G17 | The k3s node runs in its own PID namespace inside the Docker VM and mounts neither debugfs nor tracefs | eBPF profilers cannot map kernel PIDs even with `hostPID`; the otelcol eBPF profiler fails its system analysis | Profiler disabled in the `local` Coralogix overlay; profiles are verified on `dev` |
| G18 | Same-account security group references come back as `<account>/sg-…` | `aws_vpc_security_group_ingress_rule` plans an in-place update forever | F1 ignores exactly this attribute change (`infra/local/scripts/plan-quirks.py`); Terraform is unchanged |
| G19 | Default network ACL entries lose `ipv6_cidr_block` and report unset ICMP fields as `0` | `aws_default_network_acl` (vpc module) plans an update forever | F1 ignores the change when the rules match after normalising those fields |
| G20 | The EC2 instance-type catalog is partial (no `m5.2xlarge`) | Node groups with types outside the catalog are rejected | `envs/local` uses `m7gd.2xlarge` (Graviton, matches arm64 hosts) |
| G21 | k3s 1.37 pre-installs Gateway API v1.6.1 standard-channel CRDs and the `safe-upgrades.gateway.networking.k8s.io` ValidatingAdmissionPolicy (HelmChart `kube-system/gateway-api-crd`) | Experimental-channel CRDs are rejected, which broke Argo CD's server-side diff | Envoy Gateway's CRD chart uses the standard channel in every environment (it carries every kind used here); on floci Argo CD co-owns the identical CRDs with k3s |
| G22 | The k3s container exited once after the node's IP changed | Cluster API unreachable | `docker start <k3s container>`; cluster state survives (observed once, 2026-11-01) |

## Verification (fitness functions)

Run by `make local-verify`; CI (GitHub Actions `ubuntu-24.04-arm`, nightly and on PRs labelled `e2e`) runs the same `make local-all local-verify`, so CI and laptops share one code path. Standard arm64 runners have 4 vCPU, 16 GB RAM and 14 GB disk, so CI uses a `ci` profile: free preinstalled toolchains first (tens of GB), then cap the k3s container with `FLOCI_SERVICES_EKS_MAX_VCPUS=4` and `FLOCI_SERVICES_EKS_MAX_MEMORY_MIB=12288` (`make local-all PROFILE=ci`):

- **F1** `terraform plan` on `global` and `envs/local/*` is empty after apply (idempotency; catches emulator/provider drift). The floci response quirks G18 and G19 are filtered attribute by attribute (`infra/local/scripts/plan-quirks.py`); any other change fails.
- **F2** `kubectl get nodes` Ready; every Argo CD Application `Synced/Healthy` within 10 min of bootstrap.
- **F3** ESO reads `cms-demo/local/*` from Secrets Manager and `/cms-demo/local/*` from SSM; with IAM enforcement on, a read of `cms-demo/dev/*` is denied.
- **F4** `curl localhost:8080/cms` → 200; `curl localhost:8080/api/media` → 200; SignalR negotiate on `/hubs/board` → 200 and the WebSocket upgrade succeeds; `POST /v1/traces` reaches the collector (not a 404 from Envoy).
- **F5** An upload through the API lands on `media.uploaded` and the media worker consumes the topic; the check names the upload once the worker reaches it. The worker handles one message at a time and commits an offset only after storing a caption, so with the placeholder captioning endpoint and the load generator running it can trail, and a restarted worker replays the topic from the start.
- **F6** `make local-nuke` leaves no floci-spawned containers except the ECR registry (kept by design).
