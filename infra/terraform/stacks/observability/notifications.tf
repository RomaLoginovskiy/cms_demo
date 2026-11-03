# Notification Center. The alerts carry no destinations of their own: each opens a Case, and
# Cases of alerts labelled routing.team=<owning_team> match the team's router, which posts them
# to Slack. Routing labels are unique within a Coralogix team, so there is one router per owning team.

resource "coralogix_connector" "slack" {
  type        = "slack"
  name        = "slack-prod-alerts"
  description = "Slack #${var.slack_channel}. Managed by Terraform: infra/terraform/stacks/observability (cms_demo)."

  connector_config = {
    fields = [
      { field_name = "integrationId", value = var.slack_integration_id },
      { field_name = "channel", value = var.slack_channel },
      # One Slack thread per Case: updates and "resolved" land in the thread of the first message.
      { field_name = "replyInThread", value = "true" },
      { field_name = "updateExistingMessage", value = "true" },
    ]
  }
}

resource "coralogix_global_router" "team" {
  name        = var.owning_team
  description = "Routes Cases of team ${var.owning_team} (alerts labelled routing.team=${var.owning_team}) to Slack #${var.slack_channel}. Managed by Terraform: infra/terraform/stacks/observability (cms_demo)."

  routing_labels = {
    team = var.owning_team
  }

  rules = [{
    name        = "${var.owning_team} cases to #${var.slack_channel}"
    entity_type = "cases"
    condition   = "true"
    targets     = [{ connector_id = coralogix_connector.slack.id }]
  }]
}
