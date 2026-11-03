# Dashboards are kept as the JSON the Coralogix UI exports (Dashboard → Export), without "id" and
# "folderId": edit in the UI, export, and replace the file. The API dashboard is exported from
# cms-local; its queries and titles name the cluster, so the cluster name is substituted.

locals {
  dashboards = {
    api_health            = { file = "api-health.json", in_rum_folder = false }
    rum_errors_web_vitals = { file = "rum-errors-web-vitals.json", in_rum_folder = true }
    rum_release_tracking  = { file = "rum-release-tracking.json", in_rum_folder = true }
  }
}

resource "coralogix_dashboards_folder" "rum" {
  name = "Miro RUM Workshop"
}

resource "coralogix_dashboard" "this" {
  for_each = local.dashboards

  content_json = replace(file("${path.module}/dashboards/${each.value.file}"), "cms-local", var.cluster_name)
  folder       = each.value.in_rum_folder ? { id = coralogix_dashboards_folder.rum.id } : null
}
