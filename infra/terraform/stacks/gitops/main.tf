# Bootstraps Argo CD and hands the cluster over to Git. Inputs come from SSM parameters written by
# the infra stack (no remote state), so the same values are visible to ESO and to humans.

data "aws_caller_identity" "current" {}

data "aws_eks_cluster" "this" {
  name = var.cluster_name
}

data "aws_ssm_parameters_by_path" "platform" {
  path      = "/${var.project}/${var.env}/platform"
  recursive = true
}

data "aws_ecr_repository" "probe" {
  name = "${var.project}/cms-backend"
}

locals {
  platform_prefix = "/${var.project}/${var.env}/platform/"

  # Coordinates, not secrets.
  platform = zipmap(
    [for n in data.aws_ssm_parameters_by_path.platform.names : trimprefix(n, local.platform_prefix)],
    nonsensitive(data.aws_ssm_parameters_by_path.platform.values),
  )

  irsa = { for k, v in local.platform : trimprefix(k, "irsa/") => v if startswith(k, "irsa/") }

  # "-" marks values that do not exist in this environment (no public edge on floci).
  optional = {
    for k in ["public_hostname", "acm_certificate_arn", "route53_zone_name", "public_ingress_cidrs"] :
    k => local.platform[k] if lookup(local.platform, k, "-") != "-"
  }

  ecr_registry = trimsuffix(data.aws_ecr_repository.probe.repository_url, "/${var.project}/cms-backend")

  cluster_labels = {
    environment = var.env
    cloud       = local.emulated ? "floci" : "aws"
  }

  cluster_annotations = merge(
    {
      aws_account_id   = data.aws_caller_identity.current.account_id
      aws_region       = var.region
      aws_cluster_name = var.cluster_name
      aws_vpc_id       = local.platform["vpc_id"]
      ecr_registry     = local.ecr_registry
      gitops_repo_url  = var.gitops_repo_url
      gitops_revision  = var.gitops_revision
    },
    local.optional,
    { for k, v in local.irsa : "irsa_role_arn_${k}" => v },
    var.aws_endpoint_url_in_cluster == null ? {} : { aws_endpoint_url = var.aws_endpoint_url_in_cluster },
  )

  repo_root = "${path.root}/../../../.."
}

module "gitops" {
  source = "../../modules/gitops-bootstrap"

  cluster_name         = var.cluster_name
  argocd_chart_version = var.argocd_chart_version
  argocd_values = [
    file("${local.repo_root}/deploy/platform/argo-cd/values.yaml"),
    file("${local.repo_root}/deploy/platform/argo-cd/values-${var.env}.yaml"),
  ]

  repo_url = var.gitops_repo_url
  revision = var.gitops_revision

  cluster_labels      = local.cluster_labels
  cluster_annotations = local.cluster_annotations
}
