# P1 alerts of the incident demo (spec/architecture/incident-demo-scope-2026-11-03.md). Routing is by
# label: routing.team sends their Cases through the team's router (notifications.tf); "team" is the
# owning team shown in the alert.

locals {
  # Without a console URL the description names the dashboard instead of linking it.
  api_dashboard = (var.console_url == null
    ? "'${jsondecode(local.dashboard_json["api_health"]).name}' (Coralogix Dashboards)"
    : "${var.console_url}/dashboards/${coralogix_dashboard.this["api_health"].id}"
  )

  alert_routing = (var.slack == null
    ? "owning team: ${var.owning_team} (routing.team)"
    : "owning team: ${var.owning_team} (routing.team, Cases routed by router ${var.owning_team} to #${var.slack.channel})"
  )
  alert_footer = "Dashboard: ${local.api_dashboard} · Runbook: spec/components/workshop-scenarios.md, INC-1 (cms_demo repo)."

  alert_labels = {
    team           = var.owning_team
    "routing.team" = var.owning_team
    cluster        = var.cluster_name
    workshop       = "cms-incident-demo"
  }

  alert_incidents = {
    notify_on           = "Triggered and Resolved"
    retriggering_period = { minutes = 10 }
  }
}

resource "coralogix_alert" "api_p95" {
  name        = "[${var.cluster_name}] CMS API p95 latency > 150 ms"
  description = "P1 · ${local.alert_routing}. p95 latency of demo-cms-api server spans (Coralogix APM span metrics, health checks excluded) is above 150 ms (2-minute rate, held for 1 minute) in cluster ${var.cluster_name}. Baseline is about 50 ms. ${local.alert_footer}"
  labels      = merge(local.alert_labels, { service = "demo-cms-api" })

  incidents_settings = local.alert_incidents

  type_definition = {
    metric_threshold = {
      metric_filter = {
        promql = "histogram_quantile(0.95, sum by (le) (rate(duration_ms_bucket{service_name=\"demo-cms-api\", k8s_cluster_name=\"${var.cluster_name}\", span_kind=\"SPAN_KIND_SERVER\", span_name!~\"GET /(healthz|ready)\"}[2m])))"
      }
      missing_values = { replace_with_zero = false }
      rules = [{
        condition = {
          condition_type = "MORE_THAN"
          threshold      = 150
          for_over_pct   = 100
          of_the_last    = "1_MINUTE"
        }
        override = { priority = "P1" }
      }]
    }
  }
}

resource "coralogix_alert" "postgres_fatal" {
  name        = "[${var.cluster_name}] cms-postgres FATAL errors > 10 in 5 min"
  description = "P1 · ${local.alert_routing}. More than 10 PostgreSQL FATAL logs (severity Critical) from cms-demo/cms-postgres in cluster ${var.cluster_name} within 5 minutes. Baseline is 0. Signature of the 2026-11-02 and 2026-11-03 incidents: 'the database system is shutting down', 'sorry, too many clients already' (SQLSTATE 53300), 'terminating connection due to administrator command', with pg_isready liveness/readiness probe timeouts restarting cms-postgres-0 and Npgsql exceptions in cms-backend. ${local.alert_footer}"
  labels      = merge(local.alert_labels, { service = "cms-postgres" })

  incidents_settings = local.alert_incidents

  type_definition = {
    logs_threshold = {
      logs_filter = {
        simple_filter = {
          # OTel resource attributes keep their dots in Lucene; k8s_cluster_name does not exist on these logs.
          lucene_query = "resource.attributes.k8s.cluster.name:\"${var.cluster_name}\""
          label_filters = {
            application_name = [{ value = "cms-demo", operation = "IS" }]
            subsystem_name   = [{ value = "cms-postgres", operation = "IS" }]
            severities       = ["Critical"]
          }
        }
      }
      notification_payload_filter = ["body"]
      rules = [{
        condition = {
          condition_type = "MORE_THAN"
          threshold      = 10
          time_window    = "5_MINUTES"
        }
        override = { priority = "P1" }
      }]
    }
  }
}
