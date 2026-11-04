# Offline stack test (make tf-validate): the Coralogix provider is mocked, so it needs no API key,
# no backend and creates nothing. The live check is the plan/apply against the team.
mock_provider "coralogix" {}

# A team with every optional input set; the last runs leave them out, as a new account would.
variables {
  env          = "local"
  console_url  = "https://tftest.coralogix.com"
  cluster_name = "tftest-cluster"
  slack        = { integration_id = "tftest-integration" }
}

run "routing" {
  assert {
    condition = alltrue([
      for a in [coralogix_alert.api_p95, coralogix_alert.postgres_fatal] :
      a.labels["routing.team"] == coralogix_global_router.team[0].routing_labels.team
    ])
    error_message = "Every alert carries the routing.team label its team's router matches."
  }

  assert {
    condition     = coralogix_global_router.team[0].rules[0].entity_type == "cases" && coralogix_global_router.team[0].rules[0].targets[0].connector_id == coralogix_connector.slack[0].id
    error_message = "The router sends the team's Cases to the Slack connector."
  }

  assert {
    condition     = contains([for f in coralogix_connector.slack[0].connector_config.fields : f.value if f.field_name == "channel"], "production-alerts")
    error_message = "The connector posts to #production-alerts."
  }
}

run "cluster_and_links" {
  assert {
    condition     = strcontains(coralogix_alert.api_p95.description, "https://tftest.coralogix.com/dashboards/${coralogix_dashboard.this["api_health"].id}")
    error_message = "The p95 alert links the API dashboard."
  }

  assert {
    condition     = strcontains(coralogix_alert.postgres_fatal.description, "https://tftest.coralogix.com/dashboards/${coralogix_dashboard.this["api_health"].id}")
    error_message = "The Postgres alert links the API dashboard."
  }

  assert {
    condition = (
      startswith(coralogix_alert.api_p95.name, "[tftest-cluster] ")
      && strcontains(coralogix_alert.api_p95.type_definition.metric_threshold.metric_filter.promql, "k8s_cluster_name=\"tftest-cluster\"")
      && strcontains(coralogix_alert.postgres_fatal.type_definition.logs_threshold.logs_filter.simple_filter.lucene_query, "\"tftest-cluster\"")
    )
    error_message = "Alert names and queries use the environment's cluster."
  }

  assert {
    condition = (
      !strcontains(coralogix_dashboard.this["api_health"].content_json, "cms-local")
      && strcontains(coralogix_dashboard.this["api_health"].content_json, "k8s_cluster_name=\\\"tftest-cluster\\\"")
    )
    error_message = "The API dashboard queries the environment's cluster."
  }

  assert {
    condition = (
      coralogix_dashboard.this["api_health"].folder == null
      && coralogix_dashboard.this["rum_errors_web_vitals"].folder.id == coralogix_dashboards_folder.rum.id
      && coralogix_dashboard.this["rum_release_tracking"].folder.id == coralogix_dashboards_folder.rum.id
    )
    error_message = "The RUM dashboards live in the RUM folder; the API dashboard at the top level."
  }
}

run "new_account_without_slack_or_console_url" {
  variables {
    console_url = null
    slack       = null
  }

  assert {
    condition     = length(coralogix_connector.slack) == 0 && length(coralogix_global_router.team) == 0
    error_message = "Without Slack there is no connector and no router."
  }

  assert {
    condition = alltrue([
      for a in [coralogix_alert.api_p95, coralogix_alert.postgres_fatal] :
      !strcontains(a.description, "https://") && !strcontains(a.description, "#production-alerts")
      && strcontains(a.description, "'cms-demo · API health (tftest-cluster)'")
    ])
    error_message = "Without a console URL the alerts name the dashboard; without Slack they claim no channel."
  }

  assert {
    condition     = coralogix_dashboards_folder.rum.name == "cms-demo RUM" && output.adopt_ids.slack_connector == null
    error_message = "Neutral folder name by default; adopt_ids has no Slack connector."
  }
}

run "adopt_rejects_unknown_dashboard" {
  command = plan

  variables {
    adopt = { dashboards = { not_defined = "x" } }
  }

  expect_failures = [var.adopt]
}
