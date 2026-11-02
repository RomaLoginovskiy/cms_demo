# Fail fast on unanswered open decisions (Q1/Q3/Q4) instead of half-creating an environment.
resource "terraform_data" "guards" {
  lifecycle {
    precondition {
      condition     = alltrue([for c in var.admin_cidrs : can(cidrnetmask(c))]) && length(var.admin_cidrs) > 0
      error_message = "admin_cidrs must be a non-empty list of IPv4 CIDRs."
    }

    precondition {
      condition = !var.enable_edge || (
        var.public_hostname != null && var.route53_zone_name != null &&
        !strcontains(coalesce(var.public_hostname, "REPLACE"), "REPLACE") &&
        !strcontains(coalesce(var.route53_zone_name, "REPLACE"), "REPLACE")
      )
      error_message = "enable_edge needs public_hostname and route53_zone_name (open decision Q3)."
    }

    precondition {
      condition     = alltrue([for c in var.public_ingress_cidrs : can(cidrnetmask(c))])
      error_message = "public_ingress_cidrs must be IPv4 CIDRs (open decision Q4)."
    }

    precondition {
      condition     = var.kafka_broker_count % var.msk_az_count == 0
      error_message = "kafka_broker_count must be a multiple of msk_az_count (MSK rule)."
    }
  }
}
