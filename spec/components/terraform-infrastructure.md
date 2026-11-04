# Component: Terraform Infrastructure

**Status**: Proposed (2026-10-30, revised after review)  
**Decisions**: [ADR-017](../adr/ADR-017-aws-eks-gitops-platform.md), [ADR-019](../adr/ADR-019-workload-identity-irsa.md), [ADR-020](../adr/ADR-020-aws-data-services-mapping.md)  
**Related**: [aws-eks-platform.md](../architecture/aws-eks-platform.md), [gitops-argocd.md](gitops-argocd.md), [floci-local-environment.md](floci-local-environment.md)

## Responsibility

Terraform creates and owns **every AWS resource** and **publishes their coordinates** for the cluster to consume. It installs Argo CD once and creates the Argo CD cluster registration; it does not manage application or add-on manifests.

## Repository layout

```
infra/
  terraform/
    stacks/                     # one root per layer, shared by every environment
      bootstrap/  global/  infra/  gitops/  observability/
    envs/
      local/                    # backend.hcl + <stack>.tfvars (floci)
      dev/                      # backend.hcl + <stack>.tfvars (AWS)
      prod/                     # phase 4
    modules/
      network/  eks/  ecr/  msk/  app-config/  edge-dns/  github-oidc/  budget/  gitops-bootstrap/
      s3-media/  rds-postgres/  opensearch/          # phase 3
    .tflint.hcl
  local/                        # floci compose, Makefile, scripts (floci-local-environment.md)
```

Each stack is one root module used by **every** environment: it pins providers, declares a partial S3 backend, and composes modules. An environment is only `envs/<env>/backend.hcl` plus `envs/<env>/<stack>.tfvars`, so floci and AWS run identical code. `infra/local/scripts/tf.sh <env> <stack> <cmd>` (also `make tf ENV= STACK= CMD=`) initialises with `-backend-config=envs/<env>/backend.hcl -backend-config=key=<env>/<stack>.tfstate` and a per-environment `TF_DATA_DIR`.

## Layers and state

| Root | Contents | State key | Applied by |
|---|---|---|---|
| `stacks/bootstrap` | S3 bucket `cms-demo-tfstate-<account>-eu-west-1` (versioned, SSE-S3 so the plan role needs no KMS rights, TLS-only policy, public access blocked) | local, then migrated into the bucket | operator, once |
| `stacks/global` | `ecr`, `github-oidc`, `budget` | `<env>/global.tfstate` | CI (`terraform.yml`) |
| `stacks/infra` | `network`, `eks`, `msk`, `app-config`, `edge-dns` (+ phase 3 modules) | `<env>/infra.tfstate` | CI for `dev` (after GitHub environment approval) |
| `stacks/gitops` | `gitops-bootstrap` (Helm + Kubernetes providers) | `<env>/gitops.tfstate` | operator from an `admin_cidrs` address (rare) |
| `stacks/observability` | Coralogix alerts, dashboards and Notification Center routing (Coralogix provider only; [workshop-telemetry-detection.md](workshop-telemetry-detection.md#detection-as-code-stack-observability)) | `<env>/observability.tfstate` | operator (`local` only so far) |

- **Locking**: AWS backends use the S3 lockfile (`use_lockfile = true`, Terraform ≥ 1.10). The floci backend uses bucket `cms-demo-tfstate-local` with DynamoDB table `cms-demo-tflock-local` (floci's documented pattern); spike S7 checks whether the S3 lockfile works on floci, in which case DynamoDB is dropped.
- **Inter-layer contract**: `gitops` reads `infra` results from SSM parameters ([Outputs contract](#outputs-contract)), not `terraform_remote_state`, so layers stay decoupled and the same parameters feed ESO.
- The Kubernetes and Helm providers appear **only** in the `gitops` layer. Configuring them from a cluster created in the same root is the classic Terraform failure mode on cluster replacement.

## Provider configuration

AWS environments:

```hcl
provider "aws" {
  region              = "eu-west-1"
  allowed_account_ids = [var.account_id]
  default_tags { tags = local.tags }   # Project, Environment, ManagedBy, Repository, Owner
}
```

The stacks implement both with **one** provider block driven by `var.aws_endpoint_url` (null on AWS, `http://localhost:4566` on floci); conceptually the floci side is:

```hcl
provider "aws" {
  region                      = "eu-west-1"
  s3_use_path_style           = true
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  # credentials: the local-admin access key from infra/local/.env.local (test/test is refused by EKS auth)
  endpoints {
    acm                    = local.floci
    applicationautoscaling = local.floci
    backup                 = local.floci
    budgets                = local.floci
    cloudwatch             = local.floci
    dynamodb               = local.floci
    ec2                    = local.floci
    ecr                    = local.floci
    eks                    = local.floci
    elasticache            = local.floci
    elbv2                  = local.floci
    iam                    = local.floci
    kafka                  = local.floci
    kms                    = local.floci
    logs                   = local.floci
    opensearch             = local.floci
    rds                    = local.floci
    route53                = local.floci
    s3                     = local.floci
    secretsmanager         = local.floci
    ssm                    = local.floci
    sts                    = local.floci
  }
}

locals {
  floci = "http://localhost:4566"
}
```

Every service a module touches must be listed: an unlisted service makes the provider call real AWS endpoints, which then fails on the emulator credentials. CI greps plans for unlisted services.

`gitops` layer, both runtimes (Helm provider 3.x attribute syntax):

```hcl
provider "helm" {
  kubernetes = {
    host                   = data.aws_eks_cluster.this.endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.this.certificate_authority[0].data)
    exec = {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", var.cluster_name, "--region", "eu-west-1"]
      env         = var.aws_cli_env   # local: { AWS_ENDPOINT_URL = "http://localhost:4566" }
    }
  }
}
```

### Version pins

| Item | Constraint | Notes |
|---|---|---|
| Terraform | stacks accept `>= 1.6` (the floci backend uses DynamoDB locking); AWS backends need `>= 1.10` for `use_lockfile`; CI pins 1.17.1 | host has 1.6.2: fine locally, upgrade before working on AWS |
| `hashicorp/aws` | `~> 6.71` | |
| `hashicorp/helm` | `~> 3.3` | v3 attribute syntax |
| `hashicorp/kubernetes` | `~> 3.4` | |
| `terraform-aws-modules/vpc/aws` | `~> 6.7` | |
| `terraform-aws-modules/eks/aws` | `~> 21.29` | |
| `terraform-aws-modules/iam/aws` | `~> 6.8` | `iam-role-for-service-accounts` |
| `terraform-aws-modules/msk-kafka-cluster/aws` | `~> 3.3` | |
| `terraform-aws-modules/rds/aws` | `~> 7.2` | phase 3 |

`.terraform.lock.hcl` is committed for every root with hashes for `darwin_arm64`, `linux_arm64` and `linux_amd64`.

## Module contracts

| Module | Key inputs | Key outputs | Wraps / notes |
|---|---|---|---|
| `network` | `name`, `cidr`, `azs` (3), `single_nat_gateway`, `enable_interface_endpoints` | `vpc_id`, `public/private/intra_subnet_ids`, `nat_public_ips` | terraform-aws-modules/vpc; ELB discovery subnet tags; S3 gateway endpoint always |
| `eks` | `cluster_name`, `kubernetes_version` (`1.37`), `vpc_id`, `node_subnet_ids` (AZs a/b in `dev`), `control_plane_subnet_ids`, `node_groups`, `admin_principal_arns`, `public_access_cidrs`, `irsa_roles` (map of `{namespace, service_account, policy_json \| policy_arns}`), `emulator` | `cluster_name`, `endpoint`, `certificate_authority`, `oidc_provider_arn`, `oidc_issuer`, `node_security_group_id`, `irsa_role_arns` (map) | terraform-aws-modules/eks + iam IRSA submodule; `API` auth mode; add-ons `vpc-cni` (network policy enabled, before compute), `coredns`, `kube-proxy`, `aws-ebs-csi-driver`; KMS secrets encryption; control-plane logs `api`, `audit`, `authenticator`; node group `use_latest_ami_release_version = false` (no public SSM AMI lookup) |
| `ecr` | `repositories` (6 names under `cms-demo/`), `image_tag_mutability = "IMMUTABLE"`, `keep_last = 30`, `pull_principal_arns` | `repository_urls`, `registry` | scan on push; untagged images expire after 7 days |
| `msk` | `name`, `kafka_version`, `broker_instance_type`, `broker_count` (2), `subnet_ids` (**2** intra subnets: count must divide `broker_count`), `client_sg_ids`, `client_broker_encryption` (`TLS_PLAINTEXT` → `TLS` in phase 3) | `bootstrap_brokers`, `bootstrap_brokers_tls` | terraform-aws-modules/msk-kafka-cluster with `enable_storage_autoscaling = false`; configuration `auto.create.topics.enable=false`, `default.replication.factor=2`, `min.insync.replicas=1` |
| `app-config` | `env`, `parameters` (map, values must be non-empty), `secrets` (map of name → placeholder JSON), `kms_key_admins` | `parameter_arns`, `secret_arns`, `kms_key_arn` | SSM parameters; Secrets Manager secrets **with a placeholder version** and `lifecycle.ignore_changes = [secret_string]`; IAM policy documents for the two ESO roles |
| `edge-dns` | `zone_name`, `hostname`, `create_zone` | `certificate_arn`, `fqdn`, `zone_id` | ACM certificate with DNS validation in Route 53. The A/AAAA alias for the NLB is created by external-dns, not Terraform. Not used in `local` |
| `github-oidc` | `repository` (`RomaLoginovskiy/cms_demo`), `roles` | `role_arns` | trust pinned to repo + branch/environment; the plan role also gets `s3:PutObject`/`s3:DeleteObject` on `*.tflock` |
| `budget` | `limit_usd`, `notification_emails` | — | 80 % and 100 % alerts |
| `gitops-bootstrap` | `argocd_chart_version`, `argocd_values`, `repo_url`, `revision`, `cluster_labels`, `cluster_annotations` | — | `helm_release` `argo-cd` (`lifecycle.ignore_changes = all`; Argo CD manages itself afterwards); `kubernetes_secret_v1` cluster Secret (GitOps Bridge) with `ignore_changes` on the `image_tag_override` and `gitops_revision` annotations (local overrides); root `Application` through a second `helm_release` of the `argocd-apps` chart in project `default` (a `kubernetes_manifest` would need the Application CRD at plan time) |
| `s3-media` *(phase 3)* | `bucket_name`, `kms_key_arn`, `writer_role_arn` | `bucket_name`, `bucket_arn` | versioning, SSE-KMS, public access block, lifecycle for noncurrent versions |
| `rds-postgres` *(phase 3)* | `engine_version`, `instance_class` (`db.t4g.micro` dev), `multi_az`, `subnet_ids` (intra), `client_sg_ids` | `endpoint`, `port`, `master_secret_arn` | terraform-aws-modules/rds; `manage_master_user_password = true` |
| `opensearch` *(phase 3, optional)* | `engine_version`, `instance_type`, `subnet_ids`, `client_sg_ids` | `endpoint` | VPC domain, policy scoped to the node SG |

### IRSA roles (`eks.irsa_roles`)

| Key | Namespace / service account | Permissions |
|---|---|---|
| `eso_app` | `external-secrets` / `eso-app` | `secretsmanager:GetSecretValue` on `cms-demo/<env>/coralogix-rum*`, `cms-demo/<env>/llm*`; `ssm:GetParameter*` on `/cms-demo/<env>/{kafka,app,llm}/*`; `kms:Decrypt` (app key) |
| `eso_observability` | `external-secrets` / `eso-observability` | `secretsmanager:GetSecretValue` on `cms-demo/<env>/coralogix-ingest*`; `ssm:GetParameter*` on `/cms-demo/<env>/kafka/*`; `kms:Decrypt` |
| `aws_load_balancer_controller` | `kube-system` / `aws-load-balancer-controller` | AWS-published LBC policy (AWS only) |
| `ebs_csi_driver` | `kube-system` / `ebs-csi-controller-sa` | `AmazonEBSCSIDriverPolicy` (AWS only) |
| `external_dns` | `external-dns` / `external-dns` | Route 53 changes on the one hosted zone (AWS only) |
| `cms_backend` *(phase 3)* | `cms-demo` / `cms-backend` | S3 media bucket read/write |

### Emulator-specific inputs (complete list)

The `emulator` input (`"floci"` or `"none"`) is allowed to change **only** these behaviours:

| Where | floci behaviour | Reason |
|---|---|---|
| `eks` | `include_oidc_root_ca_thumbprint = false` | floci issuers are not fetchable |
| `eks` | `enable_cluster_creator_admin_permissions = false` | floci rejects `AssociateAccessPolicy` for user ARNs and does not enforce access entries (gap G14) |
| `eks` | no EKS-managed add-ons (`addons = {}`) | floci's add-on catalog stops at 1.32 and add-ons are metadata only there (gaps G2, G15) |
| `envs/local/infra.tfvars` | node group instance type `m5.2xlarge` (1 node) | the first node group's type sizes the single k3s container (capped by `FLOCI_SERVICES_EKS_MAX_*`); `m5.*` is in floci's catalog |
| `envs/local/infra.tfvars` | `enable_edge = false` (no `edge-dns`, no external-dns role) | no NLB or public DNS locally |
| `envs/local/gitops.tfvars` | `aws_endpoint_url` set (so cluster label `cloud=floci`), annotation `aws_endpoint_url=http://floci:4566` | add-on selection and endpoint overrides ([gitops-argocd.md](gitops-argocd.md)) |

Anything else that needs an emulator branch is a floci gap: record it in [floci-local-environment.md](floci-local-environment.md#fidelity-gaps-and-mitigations) instead of adding a conditional. Spike S7 checks one known candidate: the EKS module pre-creates the `/aws/eks/<cluster>/cluster` log group, and floci also creates it when `api`/`audit` logging is enabled.

## Outputs contract

Coordinates are published under one prefix per environment. These names are the interface between Terraform, Argo CD and the application; changing one is a breaking change. **No parameter or secret is ever empty**: unknown values get explicit placeholders so ExternalSecrets resolve on the first sync.

### SSM Parameter Store (`String`)

| Parameter | Producer | Consumers | `dev` example | `local` example |
|---|---|---|---|---|
| `/cms-demo/<env>/kafka/bootstrap_brokers` | `msk` | cms-backend, media-worker, topics Job | `b-1.cmsdev….kafka.eu-west-1.amazonaws.com:9092,b-2…:9092` | address returned by floci `GetBootstrapBrokers` |
| `/cms-demo/<env>/kafka/replication_factor` | `app-config` | topics Job | `2` | `1` |
| `/cms-demo/<env>/app/public_origin` | `app-config` | `Cors__Origin` of both APIs | `https://cms-dev.<domain>` | `http://localhost:8080` |
| `/cms-demo/<env>/llm/base_url`, `/llm/model` | `app-config` (variables, Q5) | media-worker | placeholder `http://llm.invalid/v1`, `none` until Q5 | same placeholders |
| `/cms-demo/<env>/platform/{cluster_name,vpc_id,oidc_provider_arn}` | `eks`, `network` | `gitops` layer | | |
| `/cms-demo/<env>/platform/irsa/<key>` | `eks` | `gitops` layer | role ARNs | role ARNs (floci) |
| `/cms-demo/<env>/platform/acm_certificate_arn`, `/platform/public_ingress_cidrs` | `edge-dns`, root | `gitops` layer | ACM ARN; allowlist + NAT EIPs | `-` / `0.0.0.0/0` |
| *(phase 3)* `/cms-demo/<env>/s3/media_bucket`, `/db/endpoint`, `/db/port`, `/db/name`, `/db/master_secret_arn`, `/search/endpoint` | `s3-media`, `rds-postgres`, `opensearch` | cms-backend, canvas-backend, migration Jobs | | |

### Secrets Manager (placeholder versions; real values written out of band)

| Secret | Keys (placeholder) | Written by | Consumers |
|---|---|---|---|
| `cms-demo/<env>/coralogix-ingest` | `PRIVATE_KEY` (`placeholder-not-a-key`; an empty key would crash the collectors) | operator (`aws secretsmanager put-secret-value`); `make local-secrets` locally | `observability` only (`coralogix-keys`) |
| `cms-demo/<env>/coralogix-rum` | `RUM_PUBLIC_KEY` (`""` → RUM SDK disabled) | operator / `make local-secrets` | both frontends |
| `cms-demo/<env>/llm` | `API_KEY` (`none`) | operator (Q5) | media-worker (`OpenAI__ApiKey`) |
| *(phase 3)* RDS-managed master secret | `username`, `password` | RDS | ESO → connection strings |

### Argo CD cluster Secret (GitOps Bridge)

Created by `gitops-bootstrap` in namespace `argocd`, `server: https://kubernetes.default.svc`.

| Kind | Key | Value |
|---|---|---|
| label | `argocd.argoproj.io/secret-type` | `cluster` |
| label | `environment` | `local` \| `dev` \| `prod` |
| label | `cloud` | `floci` \| `aws` |
| annotation | `aws_account_id`, `aws_region`, `aws_cluster_name`, `aws_vpc_id` | from `infra` |
| annotation | `ecr_registry` | `<account>.dkr.ecr.eu-west-1.amazonaws.com` or `localhost:4566/000000000000/eu-west-1` |
| annotation | `public_hostname`, `acm_certificate_arn`, `public_ingress_cidrs`, `route53_zone_name` | AWS only |
| annotation | `irsa_role_arn_<key>` | one per IRSA role (table above) |
| annotation | `aws_endpoint_url` | `http://floci:4566` locally, absent on AWS |
| annotation | `gitops_repo_url`, `gitops_revision` | `https://github.com/RomaLoginovskiy/cms_demo.git`, branch (local: changed by `make local-retarget`) |
| annotation | `image_tag_override` | local only, written by `make local-images` |

## Naming and tagging

- Resource names `cms-demo-<env>-<component>`; clusters `cms-<env>`; ECR repositories `cms-demo/<service>` where `<service>` ∈ {`cms-backend`, `media-worker`, `cms-frontend`, `canvas-backend`, `canvas-frontend`, `canvas-load`} (matches Deployment names; supersedes the names in `ecs-ec2-deployment-guide.md`).
- `default_tags`: `Project=cms-demo`, `Environment=<env>`, `ManagedBy=terraform`, `Repository=RomaLoginovskiy/cms_demo`, `Owner=<owner>`.
- EBS volumes created by the CSI driver carry `backup=daily` (StorageClass `tagSpecification`), selected by an AWS Backup plan in `dev`/`prod`.

## Quality gates (CI)

1. `terraform fmt -check -recursive`, `terraform validate` per root, `tflint` (AWS ruleset), `trivy config infra/terraform`.
2. `terraform test` against floci (`make tf-test`, also in the floci e2e job): `ecr`, `app-config`, `network`, `msk` (with a real Redpanda broker), `github-oidc`, `budget` and `edge-dns` run `command = apply` (real create/destroy without AWS); `eks` runs `command = plan` only, because an apply would start a second k3s cluster and floci's add-on catalog cannot plan AWS mode (G15). `gitops-bootstrap` needs a live cluster and is covered by the `gitops` stack in F1/F2. Every test pins the provider to floci's account (`allowed_account_ids = ["000000000000"]`), so a shell pointed at AWS fails before creating anything; the endpoint comes from `AWS_ENDPOINT_URL`.
3. Idempotency: a second `plan` after `apply` is empty, on floci in CI and on `dev` after each apply.
4. Plan on `dev` for every PR touching `infra/` (plan role), posted as a PR comment.

## Apply and destroy order

Apply: `bootstrap` → `global` → `infra` → operator writes secret values → `gitops` → Argo CD converges.

Destroy (`make predestroy ENV=<env>` then Terraform), in this order, because controllers created resources Terraform does not know about:

1. Delete the `cms-demo` and `envoy-gateway` Applications (cascade). Wait until AWS LBC has deleted the NLB and its security groups (no Service of type `LoadBalancer` left, no ELB tagged `elbv2.k8s.aws/cluster=<cluster>`), while LBC itself is still running; wait for external-dns to remove its records.
2. Delete PVCs explicitly (`Delete=false` stops Argo CD from doing it); EBS volumes do not block VPC deletion, but orphans cost money (and `Retain` in `prod` needs a manual decision).
3. Delete the remaining Applications, then the `argo-cd` Application **without** cascade.
4. `terraform destroy` `gitops`, then `infra`. The VPC delete then has no foreign ENIs or security groups to trip on.
