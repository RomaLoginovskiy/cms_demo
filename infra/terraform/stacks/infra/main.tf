# Per-environment AWS resources. Identical code for floci (local) and AWS (dev/prod):
# only envs/<env>/infra.tfvars differs (see terraform-infrastructure.md, emulator-specific inputs).

locals {
  node_subnet_ids = slice(module.network.private_subnet_ids, 0, var.node_az_count)
  msk_subnet_ids  = slice(module.network.intra_subnet_ids, 0, var.msk_az_count)

  # NAT EIPs are allowlisted so in-VPC synthetic traffic (load generator) can use the public hostname.
  public_ingress_cidrs = distinct(concat(
    var.public_ingress_cidrs,
    [for ip in module.network.nat_public_ips : "${ip}/32"],
  ))

  public_origin = var.enable_edge ? "https://${var.public_hostname}" : var.local_public_origin
}

module "network" {
  source = "../../modules/network"

  name                       = "${var.project}-${var.env}"
  cidr                       = var.vpc_cidr
  azs                        = var.azs
  single_nat_gateway         = var.single_nat_gateway
  enable_interface_endpoints = var.enable_interface_endpoints
  tags                       = local.tags
}

module "app_config" {
  source = "../../modules/app-config"

  project = var.project
  env     = var.env

  # App-facing coordinates consumed through ESO. Never empty: placeholders until Q5 is decided.
  parameters = {
    "kafka/bootstrap_brokers"  = module.msk.bootstrap_brokers
    "kafka/replication_factor" = tostring(var.kafka_replication_factor)
    "app/public_origin"        = local.public_origin
    "llm/base_url"             = var.llm_base_url
    "llm/model"                = var.llm_model
  }

  secrets = {
    # Non-empty: the Coralogix exporter refuses an empty key (collectors would crash-loop); export is
    # simply rejected until the real key is written. An empty RUM key disables the browser SDK.
    "coralogix-ingest" = { PRIVATE_KEY = "placeholder-not-a-key" }
    "coralogix-rum"    = { RUM_PUBLIC_KEY = "" }
    "llm"              = { API_KEY = "none" }
  }

  reader_scopes = {
    app = {
      secrets            = ["coralogix-rum", "llm"]
      parameter_prefixes = ["kafka", "app", "llm"]
    }
    # Telemetry goes from the agent straight to Coralogix, so observability needs no parameters.
    observability = {
      secrets            = ["coralogix-ingest"]
      parameter_prefixes = []
    }
  }

  secret_recovery_window_days = var.secret_recovery_window_days
  tags                        = local.tags
}

module "edge_dns" {
  source = "../../modules/edge-dns"
  count  = var.enable_edge ? 1 : 0

  zone_name   = var.route53_zone_name
  hostname    = var.public_hostname
  create_zone = var.create_route53_zone
  tags        = local.tags
}

module "eks" {
  source = "../../modules/eks"

  name               = var.cluster_name
  kubernetes_version = var.kubernetes_version
  emulator           = var.emulator

  vpc_id                       = module.network.vpc_id
  node_subnet_ids              = local.node_subnet_ids
  control_plane_subnet_ids     = module.network.private_subnet_ids
  endpoint_public_access_cidrs = var.admin_cidrs
  admin_principal_arns         = var.admin_principal_arns
  readonly_principal_arns      = var.readonly_principal_arns
  node_group                   = var.node_group
  log_retention_days           = var.log_retention_days

  irsa_roles = merge(
    {
      eso_app = {
        namespace            = "external-secrets"
        service_account      = "eso-app"
        create_inline_policy = true
        inline_policy_json   = module.app_config.reader_policy_json["app"]
      }
      eso_observability = {
        namespace            = "external-secrets"
        service_account      = "eso-observability"
        create_inline_policy = true
        inline_policy_json   = module.app_config.reader_policy_json["observability"]
      }
      aws_load_balancer_controller = {
        namespace                              = "kube-system"
        service_account                        = "aws-load-balancer-controller"
        attach_load_balancer_controller_policy = true
      }
    },
    var.enable_edge ? {
      external_dns = {
        namespace                     = "external-dns"
        service_account               = "external-dns"
        attach_external_dns_policy    = true
        external_dns_hosted_zone_arns = [module.edge_dns[0].zone_arn]
      }
    } : {},
  )

  tags = local.tags
}

module "msk" {
  source = "../../modules/msk"

  name                       = "${var.project}-${var.env}"
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = local.msk_subnet_ids
  client_security_group_ids  = [module.eks.node_security_group_id]
  kafka_version              = var.kafka_version
  broker_instance_type       = var.kafka_broker_instance_type
  broker_count               = var.kafka_broker_count
  default_replication_factor = var.kafka_replication_factor
  tags                       = local.tags
}

# Platform coordinates for the gitops stack (read back with data sources, not remote state).
locals {
  platform_parameters = merge(
    {
      "cluster_name"         = module.eks.cluster_name
      "vpc_id"               = module.network.vpc_id
      "oidc_provider_arn"    = module.eks.oidc_provider_arn
      "public_ingress_cidrs" = coalesce(join(",", local.public_ingress_cidrs), "-")
      "acm_certificate_arn"  = var.enable_edge ? module.edge_dns[0].certificate_arn : "-"
      "public_hostname"      = var.enable_edge ? var.public_hostname : "-"
      "route53_zone_name"    = var.enable_edge ? var.route53_zone_name : "-"
    },
    { for k, arn in module.eks.irsa_role_arns : "irsa/${k}" => arn },
  )
}

resource "aws_ssm_parameter" "platform" {
  for_each = local.platform_parameters

  name  = "/${var.project}/${var.env}/platform/${each.key}"
  type  = "String"
  value = each.value
}
