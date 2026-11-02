# Module test against floci: make tf-test (infra/local/scripts/tf-test.sh sets AWS_ENDPOINT_URL and the
# local profile). allowed_account_ids pins every run to floci's account, so a shell pointed at a real
# account fails before anything is created.
provider "aws" {
  region              = "eu-west-1"
  allowed_account_ids = ["000000000000"]
}

variables {
  prefix       = "tftest-ecr"
  repositories = ["api", "web"]
  force_delete = true
}

run "repositories" {
  assert {
    condition     = keys(output.repository_urls) == ["api", "web"]
    error_message = "One repository per name under the prefix."
  }

  assert {
    condition     = alltrue([for r in aws_ecr_repository.this : r.image_tag_mutability == "IMMUTABLE"])
    error_message = "Tags must be immutable (sha-<12> tags are never re-pushed)."
  }

  assert {
    condition     = alltrue([for r in aws_ecr_repository.this : r.image_scanning_configuration[0].scan_on_push])
    error_message = "Images must be scanned on push."
  }

  assert {
    condition     = output.repository_urls["api"] == "${output.registry}/tftest-ecr/api"
    error_message = "registry must be the part of the URL before <prefix>/<name>."
  }

  assert {
    condition     = jsondecode(aws_ecr_lifecycle_policy.this["web"].policy).rules[1].selection.countNumber == 30
    error_message = "Lifecycle policy must keep the newest keep_last sha-* images."
  }

  assert {
    condition     = length(aws_ecr_repository_policy.pull) == 0
    error_message = "No repository policy without cross-account pull principals."
  }
}

run "cross_account_pull" {
  command = plan

  variables {
    pull_principal_arns = ["arn:aws:iam::111111111111:root"]
  }

  assert {
    condition     = length(aws_ecr_repository_policy.pull) == 2
    error_message = "Every repository gets the pull policy when principals are given."
  }

  assert {
    condition     = strcontains(data.aws_iam_policy_document.pull[0].json, "arn:aws:iam::111111111111:root")
    error_message = "The pull policy must name the given principals."
  }
}
