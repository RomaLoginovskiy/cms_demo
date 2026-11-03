# Coralogix team watcher (eu1), where cms-local ships its telemetry.
env           = "local"
coralogix_env = "EU1"
console_url   = "https://watcher.coralogix.com"
cluster_name  = "cms-local"

# The Slack app installed in the watcher team's own workspace (not the Coralogix corporate one).
slack_integration_id = "1f05d491-7de0-4a5e-b842-ec73b228084c"

# Objects created on 2026-11-02 and 2026-11-03 by workshop/demo/coralogix/apply.sh or in the UI,
# before this stack existed. Add the ID of anything this stack creates here too, so a lost state
# (make local-nuke) adopts it again instead of duplicating it.
adopt = {
  slack_connector = "e65f1cc8-f92b-4866-abb9-4954ed9fee09"
  router          = "48f96136-3d94-4354-8720-c114b0d99612"
  rum_folder      = "e28d13f2-abbf-4102-b4cd-0433bce4c60d"
  dashboards = {
    api_health            = "d4IsawufLdsXdj6trjkyx"
    rum_errors_web_vitals = "RVFjpS94dU3BTN8iGvwOi"
    rum_release_tracking  = "j-LxP6o3a4YDKI2UKyQTN"
  }
  alerts = {
    api_p95        = "025dac99-ca3d-48b1-9a26-86ca26e9f3ce"
    postgres_fatal = "7aada903-7394-4aff-b1f1-45041ce54429"
  }
}
