data "aws_partition" "current" {}

locals {
  emulated = var.emulator == "floci"

  admin_entries = {
    for i, arn in var.admin_principal_arns : "admin-${i}" => {
      principal_arn = arn
      policy_associations = {
        admin = {
          policy_arn   = "arn:${data.aws_partition.current.partition}:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
          access_scope = { type = "cluster" }
        }
      }
    }
  }

  readonly_entries = {
    for i, arn in var.readonly_principal_arns : "readonly-${i}" => {
      principal_arn = arn
      policy_associations = {
        view = {
          policy_arn   = "arn:${data.aws_partition.current.partition}:eks::aws:cluster-access-policy/AmazonEKSViewPolicy"
          access_scope = { type = "cluster" }
        }
      }
    }
  }
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.29"

  name               = var.name
  kubernetes_version = var.kubernetes_version

  # Access entries only; no aws-auth ConfigMap. The identity running Terraform becomes cluster admin.
  # floci (2.3.0) rejects AssociateAccessPolicy for user ARNs and does not enforce access entries
  # (IAM callers are cluster-admin there), so the creator entry is only created on AWS (gap G14).
  authentication_mode                      = "API"
  enable_cluster_creator_admin_permissions = !local.emulated
  access_entries                           = merge(local.admin_entries, local.readonly_entries)

  endpoint_public_access       = true
  endpoint_public_access_cidrs = var.endpoint_public_access_cidrs
  endpoint_private_access      = true

  vpc_id                   = var.vpc_id
  subnet_ids               = var.node_subnet_ids
  control_plane_subnet_ids = var.control_plane_subnet_ids
  service_ipv4_cidr        = var.service_ipv4_cidr

  enabled_log_types                      = ["api", "audit", "authenticator"]
  cloudwatch_log_group_retention_in_days = var.log_retention_days

  # IRSA (ADR-019). floci issuers are not fetchable, so no thumbprint lookup there.
  enable_irsa                     = true
  include_oidc_root_ca_thumbprint = !local.emulated

  # floci records add-ons as metadata only (k3s ships CoreDNS, kube-proxy and flannel) and its add-on
  # version catalog stops at Kubernetes 1.32, so the version lookups would fail there (gap G15).
  addons = local.emulated ? {} : {
    vpc-cni = {
      before_compute = true
      configuration_values = jsonencode({
        enableNetworkPolicy = "true"
      })
    }
    coredns    = {}
    kube-proxy = {}
    aws-ebs-csi-driver = {
      service_account_role_arn = module.ebs_csi_irsa.arn
    }
  }

  eks_managed_node_groups = {
    default = {
      ami_type       = var.node_group.ami_type
      instance_types = var.node_group.instance_types
      capacity_type  = var.node_group.capacity_type
      min_size       = var.node_group.min_size
      max_size       = var.node_group.max_size
      desired_size   = var.node_group.desired_size
      subnet_ids     = var.node_subnet_ids

      # EKS selects the AMI release itself; reading the public SSM parameter
      # (/aws/service/eks/optimized-ami/...) fails on floci and would also roll nodes on every new AMI.
      use_latest_ami_release_version = false

      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = var.node_group.disk_size
            volume_type           = "gp3"
            encrypted             = true
            delete_on_termination = true
          }
        }
      }

      # IMDSv2 only; pods cannot reach node credentials (hop limit 1).
      metadata_options = {
        http_endpoint               = "enabled"
        http_tokens                 = "required"
        http_put_response_hop_limit = 1
      }

      labels = {
        "cms-demo/pool" = "default"
      }
    }
  }

  tags = var.tags
}

module "ebs_csi_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts"
  version = "~> 6.8"

  name            = "${var.name}-ebs-csi-driver"
  use_name_prefix = false

  attach_ebs_csi_policy = true

  oidc_providers = {
    this = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:ebs-csi-controller-sa"]
    }
  }

  tags = var.tags
}

module "irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts"
  version = "~> 6.8"

  for_each = var.irsa_roles

  name            = "${var.name}-${replace(each.key, "_", "-")}"
  use_name_prefix = false

  oidc_providers = {
    this = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["${each.value.namespace}:${each.value.service_account}"]
    }
  }

  policies = each.value.policy_arns

  create_inline_policy           = each.value.create_inline_policy
  source_inline_policy_documents = each.value.create_inline_policy ? [each.value.inline_policy_json] : []

  attach_load_balancer_controller_policy = each.value.attach_load_balancer_controller_policy
  attach_external_dns_policy             = each.value.attach_external_dns_policy
  external_dns_hosted_zone_arns          = each.value.external_dns_hosted_zone_arns

  tags = var.tags
}
