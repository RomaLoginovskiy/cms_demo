# Dashboards are kept as Coralogix JSON: the "dashboard" object of `cx dashboards get <id> -o json`,
# without "id" and "folderId". To change one, edit it in the UI, export it that way, replace the file,
# and apply. The API dashboard was exported from cms-local; its queries and titles name the cluster,
# so the cluster name is substituted.

locals {
  dashboards = {
    api_health            = { file = "api-health.json", in_rum_folder = false }
    rum_errors_web_vitals = { file = "rum-errors-web-vitals.json", in_rum_folder = true }
    rum_release_tracking  = { file = "rum-release-tracking.json", in_rum_folder = true }
  }

  dashboard_json = {
    for k, d in local.dashboards : k => replace(file("${path.module}/dashboards/${d.file}"), "cms-local", var.cluster_name)
  }
}

resource "coralogix_dashboards_folder" "rum" {
  name = var.rum_folder_name
}

resource "coralogix_dashboard" "this" {
  for_each = local.dashboards

  content_json = local.dashboard_json[each.key]
  folder       = each.value.in_rum_folder ? { id = coralogix_dashboards_folder.rum.id } : null
}
