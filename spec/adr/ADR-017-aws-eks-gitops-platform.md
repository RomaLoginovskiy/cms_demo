# ADR-017: AWS EKS Platform with Terraform, Argo CD and floci

**Status**: Proposed  
**Date**: 2026-10-30  
**Children**: [ADR-018](ADR-018-eks-edge-routing-gateway-api.md) (edge routing), [ADR-019](ADR-019-workload-identity-irsa.md) (workload identity), [ADR-020](ADR-020-aws-data-services-mapping.md) (data services)

## Context

The demo (CMS + collaborative whiteboard + media worker + browser load generator, instrumented for Coralogix) runs today on Docker Desktop Kubernetes via `k8s/deploy.sh`. That script builds images locally, creates PVCs imperatively, installs a now-retired ingress controller, and mutates live objects with `kubectl set image/env`. There is no registry, no CI, no infrastructure code, and no promotion path. An earlier single-EC2 ECS guide (`ecs-ec2-deployment-guide.md`) covers only part of the stack.

Goal: run the full stack on **Amazon EKS**, with **Terraform** as the only way AWS resources are created, **Argo CD** as the only way in-cluster state changes, and a **local AWS emulation (floci)** that runs the same Terraform and the same GitOps manifests on a laptop and in CI.

Constraints and facts:

- Telemetry goes to Coralogix EU1 (`eu1.coralogix.com`, hosted in AWS `eu-west-1`).
- The developer machine is Apple Silicon (arm64); local images are `linux/arm64`.
- The GitHub repository `RomaLoginovskiy/cms_demo` is **public**: nothing secret may live in Git.
- Several workloads are single-replica by construction (SQLite on RWO volumes, in-memory SignalR presence); see ADR-020.
- EKS currently offers Kubernetes 1.34–1.37 in standard support (1.37 GA on EKS since 2026-10-02).

## Evaluation Criteria

- **Parity**: the local environment exercises the same IaC and manifests as AWS.
- **Operability**: few bespoke scripts; declarative, reviewable change flow.
- **Cost**: a demo-scale `dev` environment stays near USD 500/month.
- **Security**: no static AWS keys in clusters or CI; no secrets in a public repo.
- **Evolvability**: path from lift-and-shift to managed data services and multi-replica.

### Options scorecard (1 = worst, 5 = best)

| Decision area | Options (score) | Chosen |
|---|---|---|
| Orchestrator | EKS (5), ECS on EC2 (3: existing guide, but no k8s manifests reuse, canvas apps not covered), EKS Auto Mode (3: least ops, but ~12% compute surcharge and built-in LB/storage classes floci cannot emulate) | **EKS with managed node groups** |
| Node architecture | Graviton arm64 (5: matches local images, cheaper), x86_64 (3: needs cross-builds from the Mac) | **Graviton (AL2023 ARM)** |
| GitOps controller | Self-managed Argo CD (5: identical on floci and AWS), EKS Argo CD capability (3: managed and SSO-ready, but cannot run on floci and adds per-Application fees), Flux (3: viable, but user requirement is Argo CD) | **Self-managed Argo CD 3.5.x** |
| IaC | Terraform (5: user requirement; floci compat suite targets Terraform 1.10+), OpenTofu (4), CDK (2) | **Terraform ≥ 1.10, AWS provider 6.x** |
| Local emulation | floci (5: real k3s behind its EKS API, real registry behind ECR, IRSA end to end, MIT), LocalStack (3: EKS/IRSA in paid tiers), kind + no AWS (2: no IaC parity) | **floci 2.3.0** |

## Decision

1. **Environments**: `local` (floci, account `000000000000`), `dev` (AWS, first real target), `prod` (AWS, phase 4, separate account recommended). All in **`eu-west-1`**; floci's default region is set to `eu-west-1` so ARNs and endpoints look the same.
2. **Cluster**: EKS **1.37** in all environments (fallback 1.36 everywhere if floci's k3s 1.37 misbehaves). Spike S7 (2026-11-01): floci 2.3.0 starts 1.37 clusters, but its add-on catalog stops at 1.32, so EKS-managed add-ons are not declared on floci, where they are metadata only anyway. `API` authentication mode (access entries only, no `aws-auth` ConfigMap), KMS envelope encryption, control-plane logs. One managed node group of Graviton instances (AL2023 ARM). Cluster names `cms-local`, `cms-dev`, `cms-prod`.
3. **Responsibility split (the core contract)**:
   - **Terraform** owns every AWS resource and *publishes coordinates* (endpoints, ARNs, names) to SSM Parameter Store, Secrets Manager and Argo CD cluster-secret annotations. It installs Argo CD once (bootstrap) and never touches in-cluster app state again.
   - **Argo CD** owns everything inside the cluster: platform add-ons (namespaces, ESO, Reloader, Envoy Gateway, Coralogix OTel; on AWS also AWS LBC, external-dns, metrics-server and the `gp3` StorageClass) and the app, rendered from `deploy/` in this repository.
   - **External Secrets Operator** bridges the two at runtime: Kubernetes Secrets/ConfigMaps are materialised from SSM/Secrets Manager, so manifests are identical across environments except for small Kustomize overlays.
4. **Delivery**: GitHub Actions builds immutable `sha-<12>` arm64 images, pushes to ECR via GitHub OIDC (no stored keys), and promotes by changing image tags in `deploy/apps/cms-demo/overlays/<env>`; Argo CD syncs. `kubectl set image`, `deploy.sh`, and manual `helm upgrade` are retired for EKS.
5. **Edge, identity, data**: see ADR-018 (Gateway API on Envoy Gateway, NLB + ACM), ADR-019 (IRSA everywhere), ADR-020 (phased mapping to EBS/MSK first, then S3/RDS PostgreSQL).
6. **`k8s/` is frozen** as the Docker Desktop path during migration; new work lands in `deploy/` and `infra/`. It is deleted once `local` on floci replaces it.

## Implications

- **Positive**: One change path per layer; local runs catch IaC and manifest errors before AWS; no credentials in Git or CI secrets; telemetry stays in-region with Coralogix EU1.
- **Negative / Risks**:
  - floci is young and releases twice a month: pin it, keep the gap list ([floci-local-environment.md](../components/floci-local-environment.md#fidelity-gaps-and-mitigations)) current.
  - Single-replica stateful workloads remain in phase 1–2, pinned to one AZ by their EBS volumes.
  - Self-managed Argo CD is another component to upgrade and secure.
- **Follow-up actions**: execute [aws-eks-delivery-plan.md](../architecture/aws-eks-delivery-plan.md); resolve its open decisions (accounts, domain, exposure, LLM endpoint) before phase 2.

## Consultation

Repository review of `k8s/`, `coralogix/`, `backend/`, `canvas-backend/`, `frontend/`, `canvas-frontend/`, `loadgen/canvas-load/`, `ecs-ec2-deployment-guide.md`, ADR-002/013/016; floci 2.3.0 documentation and EKS source; AWS EKS version support (1.37 GA 2026-10-02); EKS Capabilities pricing (Argo CD USD 0.03/capability-hour + 0.0015/Application-hour); upstream releases as of 2026-10-30 (Argo CD 3.5.6, Envoy Gateway 1.9.3, ESO 2.14.0, AWS LBC 3.6.2, terraform-aws-modules eks 21.29 / vpc 6.7, AWS provider 6.71, Terraform 1.17.1).
