# Module test against floci (make tf-test); see modules/ecr/tests for the provider pinning.
provider "aws" {
  region              = "eu-west-1"
  allowed_account_ids = ["000000000000"]
}

variables {
  env = "tftest"
  parameters = {
    "kafka/bootstrap_brokers" = "b-1:9092,b-2:9092"
    "app/public_origin"       = "http://localhost:8080"
  }
  secrets = {
    "coralogix-ingest"     = { PRIVATE_KEY = "placeholder" }
    "coralogix-rum"        = { RUM_PUBLIC_KEY = "" }
    "coralogix-ops-events" = { API_KEY = "placeholder" }
  }
  reader_scopes = {
    app           = { secrets = ["coralogix-rum"], parameter_prefixes = ["kafka", "app"] }
    observability = { secrets = ["coralogix-ingest"], parameter_prefixes = [] }
    argocd        = { secrets = ["coralogix-ops-events"], parameter_prefixes = [] }
  }
}

run "empty_parameter_rejected" {
  command = plan

  variables {
    parameters = { "llm/base_url" = "" }
  }

  expect_failures = [var.parameters]
}

run "contract" {
  assert {
    condition     = output.parameter_names["kafka/bootstrap_brokers"] == "/cms-demo/tftest/kafka/bootstrap_brokers"
    error_message = "Parameters live under /<project>/<env>/."
  }

  assert {
    condition     = alltrue([for s in aws_secretsmanager_secret.this : s.kms_key_id == aws_kms_key.app.arn])
    error_message = "Every secret is encrypted with the application key."
  }

  assert {
    condition     = aws_kms_key.app.enable_key_rotation
    error_message = "The application key rotates."
  }

  assert {
    condition     = strcontains(output.reader_policy_json["app"], "secret:cms-demo/tftest/coralogix-rum-*")
    error_message = "The app reader may read its own secret."
  }

  assert {
    condition     = !strcontains(output.reader_policy_json["app"], "coralogix-ingest")
    error_message = "The app reader must not be able to read the Coralogix ingest key."
  }

  assert {
    condition     = !strcontains(output.reader_policy_json["argocd"], "coralogix-ingest")
    error_message = "The argocd reader (annotations key) must not be able to read the Coralogix ingest key."
  }

  assert {
    condition     = !strcontains(output.reader_policy_json["app"], "parameter/cms-demo/tftest/llm")
    error_message = "Reader scopes only grant the parameter prefixes they list."
  }

  assert {
    condition     = !strcontains(output.reader_policy_json["observability"], "ssm:")
    error_message = "A reader without parameter prefixes gets no SSM statement."
  }
}
