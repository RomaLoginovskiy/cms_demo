# Adopts objects that already exist in the team (var.adopt) instead of creating duplicates: Coralogix
# names are not unique, so a create after a lost state would add a second copy of each. "x[*]" is
# [] for null and [x] otherwise. Copy the IDs from `terraform output adopt_ids` after a first apply.

import {
  for_each = toset(var.adopt.slack_connector[*])
  to       = coralogix_connector.slack[0]
  id       = each.value
}

import {
  for_each = toset(var.adopt.router[*])
  to       = coralogix_global_router.team[0]
  id       = each.value
}

import {
  for_each = toset(var.adopt.rum_folder[*])
  to       = coralogix_dashboards_folder.rum
  id       = each.value
}

import {
  for_each = var.adopt.dashboards
  to       = coralogix_dashboard.this[each.key]
  id       = each.value
}

import {
  for_each = toset(var.adopt.alerts.api_p95[*])
  to       = coralogix_alert.api_p95
  id       = each.value
}

import {
  for_each = toset(var.adopt.alerts.postgres_fatal[*])
  to       = coralogix_alert.postgres_fatal
  id       = each.value
}
