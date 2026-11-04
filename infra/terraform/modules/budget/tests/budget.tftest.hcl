# Module test against floci (make tf-test); see modules/ecr/tests for the provider pinning.
provider "aws" {
  region              = "eu-west-1"
  allowed_account_ids = ["000000000000"]
}

variables {
  name      = "tftest-budget"
  limit_usd = 250
}

run "no_recipients_no_budget" {
  command = plan

  assert {
    condition     = length(aws_budgets_budget.this) == 0
    error_message = "No budget without notification recipients (Q9)."
  }
}

run "budget" {
  variables {
    notification_emails = ["owner@example.com"]
  }

  assert {
    condition     = aws_budgets_budget.this[0].limit_amount == "250" || aws_budgets_budget.this[0].limit_amount == "250.0"
    error_message = "Monthly cost limit in USD."
  }

  assert {
    condition     = length(aws_budgets_budget.this[0].notification) == 2
    error_message = "Alerts at 80 % actual and 100 % forecast."
  }
}
