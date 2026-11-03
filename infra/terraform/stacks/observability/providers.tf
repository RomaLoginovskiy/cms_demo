# The API key comes from CORALOGIX_API_KEY: a key of the team with the Alerts, Dashboards and
# Notification Center permissions. For env local, tf.sh reads it from infra/local/.secrets.env.
provider "coralogix" {
  env = var.coralogix_env
}
