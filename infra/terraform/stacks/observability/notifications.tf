# Notification Center. The alerts carry no destinations of their own: each opens a Case, and
# Cases of alerts labelled routing.team=<owning_team> match the team's router, which posts them
# to Slack. Routing labels are unique within a Coralogix team, so there is one router per owning
# team. Without var.slack neither is created.

resource "coralogix_connector" "slack" {
  count = var.slack == null ? 0 : 1

  type        = "slack"
  name        = var.slack.connector_name
  description = "Slack #${var.slack.channel}. Managed by Terraform: infra/terraform/stacks/observability (cms_demo)."

  connector_config = {
    fields = [
      { field_name = "integrationId", value = var.slack.integration_id },
      { field_name = "channel", value = var.slack.channel },
      # One Slack thread per Case: updates and "resolved" land in the thread of the first message.
      { field_name = "replyInThread", value = "true" },
      { field_name = "updateExistingMessage", value = "true" },
    ]
  }
}

resource "coralogix_global_router" "team" {
  count = var.slack == null ? 0 : 1

  name        = var.owning_team
  description = "Routes Cases of team ${var.owning_team} (alerts labelled routing.team=${var.owning_team}) to Slack #${var.slack.channel}. Managed by Terraform: infra/terraform/stacks/observability (cms_demo)."

  routing_labels = {
    team = var.owning_team
  }

  rules = [{
    name        = "${var.owning_team} cases to #${var.slack.channel}"
    entity_type = "cases"
    condition   = "true"
    targets     = [{ connector_id = coralogix_connector.slack[0].id }]
  }]
}

# Both were single resources before Slack became optional (2026-11-03).
moved {
  from = coralogix_connector.slack
  to   = coralogix_connector.slack[0]
}

moved {
  from = coralogix_global_router.team
  to   = coralogix_global_router.team[0]
}
