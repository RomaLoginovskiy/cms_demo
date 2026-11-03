output "dashboard_urls" {
  description = "Dashboard URLs keyed like local.dashboards"
  value       = { for k, d in coralogix_dashboard.this : k => "${var.console_url}/dashboards/${d.id}" }
}

output "alert_urls" {
  description = "Alert definition URLs"
  value = {
    api_p95        = "${var.console_url}/alerts/${coralogix_alert.api_p95.id}"
    postgres_fatal = "${var.console_url}/alerts/${coralogix_alert.postgres_fatal.id}"
  }
}

output "notification_center" {
  description = "Slack connector and router IDs"
  value = {
    slack_connector_id = coralogix_connector.slack.id
    router_id          = coralogix_global_router.team.id
  }
}
