# ADR-019: Workload Identity via IRSA in All Environments

**Status**: Proposed  
**Date**: 2026-10-30  
**Parent**: [ADR-017](ADR-017-aws-eks-gitops-platform.md)

## Context

Several in-cluster components need AWS credentials. None may use node instance-profile credentials or static access keys.

| Caller | AWS APIs | Environments |
|---|---|---|
| External Secrets Operator | Secrets Manager, SSM Parameter Store | local (floci), dev, prod |
| AWS Load Balancer Controller | ELBv2, EC2 | AWS only |
| EBS CSI driver (EKS add-on) | EC2 volumes | AWS only |
| external-dns (optional) | Route 53 | AWS only |
| cms-backend (phase 3, ADR-020) | S3 media bucket | local, dev, prod |

EKS offers two mechanisms: IRSA (projected service-account token + `sts:AssumeRoleWithWebIdentity` against a per-cluster IAM OIDC provider) and EKS Pod Identity (association API + node agent on `169.254.170.23`).

How floci 2.3.0 emulates each (from its EKS documentation and source):

- **IRSA**: works end to end with no extra settings. Each cluster gets an RSA signing key and an AWS-shaped issuer; k3s is started with that key, so projected tokens with audience `sts.amazonaws.com` are accepted by floci STS, which enforces signature, issuer, audience, expiry and the role trust policy. Floci does **not** run the IRSA mutating webhook, so a service-account annotation alone injects nothing.
- **Pod Identity**: the association API, the admission webhook and a credentials relay exist, but injection needs `FLOCI_TLS_ENABLED=true`, a certificate SAN that matches the hostname k3s uses to reach floci (extra override when floci itself runs in a container), and the `eks-pod-identity-agent` add-on recorded on the cluster. Failures are silent by design (`failurePolicy: Ignore`): pods start without credentials.

## Evaluation Criteria

- **Parity**: the same identity path runs locally and on AWS.
- **Failure visibility**: misconfiguration fails loudly, not with silently missing credentials.
- **Operability**: Terraform effort per role; number of cluster add-ons.
- **Alignment with AWS guidance**: Pod Identity is the newer recommended default for EKS.

### Options scorecard (1 = worst, 5 = best)

| Characteristic | A: Pod Identity everywhere | B: Pod Identity on AWS, IRSA on floci | C: IRSA everywhere |
|---|---|---|---|
| Parity | 4 | 1 | 5 |
| Failure visibility | 2 | 3 | 4 |
| Operability | 4 | 2 | 4 |
| AWS alignment | 5 | 4 | 3 |
| **Total** | **15** | **10** | **16** |

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| **A: Pod Identity everywhere** | AWS-recommended; no OIDC provider; role reuse across clusters | Local path depends on floci TLS mode and hostname/SAN workarounds; silent no-injection failures; needs a spike before it can be relied on |
| **B: Mixed** | Each side uses its "native" path | Two IAM trust models, two Terraform paths, two manifest shapes; local never tests the AWS path |
| **C: IRSA everywhere** | Works on floci out of the box; one trust model; supported by every Helm chart we use | One IAM OIDC provider per cluster; trust policies bind to cluster issuer, so roles are per cluster |

## Decision

**Adopt Option C.**

- Terraform creates the IAM OIDC provider for each cluster and one role per (namespace, service account), trust-scoped with `sub = system:serviceaccount:<ns>:<sa>` and `aud = sts.amazonaws.com`. On floci the provider ARN is built from the issuer returned by `DescribeCluster`; the thumbprint lookup is skipped because floci issuers are not fetchable.
- Role ARNs are published to Argo CD as cluster-secret annotations (GitOps Bridge, see [gitops-argocd.md](../components/gitops-argocd.md)); charts render them into service-account annotations. No role ARN is committed to Git.
- **Platform controllers on AWS** use the standard `eks.amazonaws.com/role-arn` annotation (the EKS-managed webhook injects the token).
- **External Secrets Operator** uses its JWT auth (`auth.jwt.serviceAccountRef`). ESO requests the token itself, so the same `ClusterSecretStore` works on EKS and floci without any webhook. Two stores, two service accounts, two roles: `eso-app` (app secrets and parameters, store usable only from namespace `cms-demo` via `spec.conditions`) and `eso-observability` (Coralogix ingest key and Kafka bootstrap parameter, usable only from `observability`), so no app namespace can read the ingest key. Locally its controller gets ESO's documented custom-endpoint variables `AWS_STS_ENDPOINT`, `AWS_SECRETSMANAGER_ENDPOINT` and `AWS_SSM_ENDPOINT` set to `http://floci:4566` (validated in spike S3).
- **Application workloads** (phase 3) declare the projected token volume (`audience: sts.amazonaws.com`) and `AWS_ROLE_ARN` / `AWS_WEB_IDENTITY_TOKEN_FILE` explicitly in their base manifests. This is valid on EKS and on floci, and does not depend on either webhook.
- Nodes: IMDSv2 required; hop limit 1 unless a component that genuinely needs IMDS is accepted (see observability notes in [aws-eks-platform.md](../architecture/aws-eks-platform.md)).
- **Revisit trigger**: floci Pod Identity injection works without TLS workarounds, or we run more than one cluster per environment.

## Implications

- **Positive**: The identity path is exercised locally; credential errors surface as `AccessDenied`/`InvalidIdentityToken` from STS instead of silent fallbacks.
- **Negative / Risks**: Roles are tied to one cluster's issuer, so a cluster rebuild means a Terraform apply before workloads get credentials (acceptable: Terraform owns the cluster anyway). Diverges from AWS's newer default; documented here with a revisit trigger.
- **Follow-up actions**: implement the `irsa_roles` map in the `eks` Terraform module ([terraform-infrastructure.md](../components/terraform-infrastructure.md)); add a smoke test that runs `aws sts get-caller-identity` from an annotated pod in each environment.

## Consultation

floci docs `services/eks.md` (IRSA, Pod Identity, TLS requirement), `services/sts.md`, `services/iam.md` (OIDC providers); External Secrets Operator AWS provider JWT auth; terraform-aws-modules/iam (v6.x) role-for-service-accounts.
