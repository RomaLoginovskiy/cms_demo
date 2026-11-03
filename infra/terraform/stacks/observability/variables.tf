variable "env" {
  description = "Environment: local, dev or prod"
  type        = string

  validation {
    condition     = contains(["local", "dev", "prod"], var.env)
    error_message = "env must be local, dev or prod."
  }
}

variable "coralogix_env" {
  description = "Coralogix region of the team the environment ships its telemetry to (EU1, US1, ...)"
  type        = string
}

variable "console_url" {
  description = "Console URL of that team, for the dashboard link in alert descriptions"
  type        = string

  validation {
    condition     = can(regex("^https://[^/]+$", var.console_url))
    error_message = "console_url must be https://<team>.coralogix.<tld> without a trailing slash."
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

variable "slack_integration_id" {
  description = "Coralogix Slack integration (one installed Slack workspace) the connector posts through"
  type        = string
}

variable "slack_channel" {
  description = "Slack channel, without #, that receives the team's Cases"
  type        = string
  default     = "production-alerts"
}

variable "adopt" {
  description = <<-EOT
    IDs of objects that already exist in the Coralogix team. imports.tf adopts them instead of
    creating duplicates; once they are in state the imports are no-ops, and after a lost state
    (make local-nuke wipes floci's state bucket) the next apply adopts them again. Empty for a
    team that has none of them yet.
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
