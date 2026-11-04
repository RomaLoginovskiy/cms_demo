# Nothing here names a particular Coralogix account. Account-specific values (region, console URL,
# Slack integration, IDs to adopt) come from the operator: for env local, the gitignored
# infra/local/observability.tfvars (see observability.tfvars.example next to it), which tf.sh adds.

variable "env" {
  description = "Environment: local, dev or prod"
  type        = string

  validation {
    condition     = contains(["local", "dev", "prod"], var.env)
    error_message = "env must be local, dev or prod."
  }
}

variable "coralogix_domain" {
  description = "Coralogix domain of your team's region (eu1.coralogix.com, us1.coralogix.com, ...). tf.sh sets it from CX_DOMAIN, the one region setting of the whole environment"
  type        = string
  default     = "eu1.coralogix.com"

  validation {
    condition     = can(regex("^[a-z0-9.-]+\\.[a-z]+$", var.coralogix_domain)) && !can(regex("^(https?:|api\\.|ingress\\.)", var.coralogix_domain))
    error_message = "coralogix_domain is the bare region domain, such as eu1.coralogix.com (no scheme, no api. or ingress. prefix)."
  }
}

variable "console_url" {
  description = "Console URL of your team (https://<team>.coralogix.com, https://<team>.app.<region domain>), for dashboard links in alert descriptions; null leaves the links out"
  type        = string
  default     = null

  validation {
    condition     = var.console_url == null || can(regex("^https://[^/]+$", var.console_url))
    error_message = "console_url must be https://<host> without a path or trailing slash."
  }
}

variable "cluster_name" {
  description = "Kubernetes cluster (k8s.cluster.name) the alerts and the API dashboard watch"
  type        = string
}

variable "owning_team" {
  description = "Team that owns the alerts: entity label team and routing label routing.team, and the name of its Notification Center router"
  type        = string
  default     = "cms-platform"
}

variable "slack" {
  description = <<-EOT
    Slack destination for the team's Cases: integration_id is the Coralogix Slack integration (one
    installed Slack workspace: Integrations → Slack, or the integrationId field of an existing Slack
    connector). null creates no connector and no router; the alerts still open Cases in Coralogix.
  EOT
  type = object({
    integration_id = string
    channel        = optional(string, "production-alerts")
    connector_name = optional(string, "slack-prod-alerts")
  })
  default = null
}

variable "rum_folder_name" {
  description = "Dashboards folder for the two RUM dashboards (folder names are unique in a team)"
  type        = string
  default     = "cms-demo RUM"
}

variable "adopt" {
  description = <<-EOT
    IDs of objects that already exist in your team. imports.tf adopts them instead of creating
    duplicates; once they are in state the imports are no-ops, and after a lost state (make
    local-nuke wipes floci's state bucket) the next apply adopts them again. Leave empty on a first
    apply; afterwards copy the IDs from `terraform output adopt_ids` to keep a lost state harmless.
  EOT
  type = object({
    slack_connector = optional(string)
    router          = optional(string)
    rum_folder      = optional(string)
    dashboards      = optional(map(string), {})
    alerts = optional(object({
      api_p95        = optional(string)
      postgres_fatal = optional(string)
    }), {})
  })
  default = {}

  validation {
    condition     = alltrue([for k in keys(var.adopt.dashboards) : contains(["api_health", "rum_errors_web_vitals", "rum_release_tracking"], k)])
    error_message = "adopt.dashboards keys must be dashboards defined in dashboards.tf."
  }
}
