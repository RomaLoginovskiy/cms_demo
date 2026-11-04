output "dashboard_urls" {
  description = "Dashboard URLs keyed like local.dashboards (IDs when console_url is not set)"
  value = {
    for k, d in coralogix_dashboard.this : k => var.console_url == null ? d.id : "${var.console_url}/dashboards/${d.id}"
  }
}

output "alert_urls" {
  description = "Alert definition URLs (IDs when console_url is not set)"
  value = {
    for k, a in { api_p95 = coralogix_alert.api_p95, postgres_fatal = coralogix_alert.postgres_fatal } :
    k => var.console_url == null ? a.id : "${var.console_url}/alerts/${a.id}"
  }
}

output "adopt_ids" {
  description = "Value for var.adopt in your infra/local/observability.tfvars: keeps a lost state from duplicating these objects"
  value = {
    slack_connector = one(coralogix_connector.slack[*].id)
    router          = one(coralogix_global_router.team[*].id)
    rum_folder      = coralogix_dashboards_folder.rum.id
    dashboards      = { for k, d in coralogix_dashboard.this : k => d.id }
    alerts = {
      api_p95        = coralogix_alert.api_p95.id
      postgres_fatal = coralogix_alert.postgres_fatal.id
    }
  }
}
