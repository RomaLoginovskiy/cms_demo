# Module test against floci (make tf-test); see modules/ecr/tests for the provider pinning.
provider "aws" {
  region              = "eu-west-1"
  allowed_account_ids = ["000000000000"]
}

variables {
  repository = "RomaLoginovskiy/cms_demo"
  roles = {
    tftest-gha-plan = {
      subjects    = ["pull_request"]
      policy_arns = { readonly = "arn:aws:iam::aws:policy/ReadOnlyAccess" }
    }
    tftest-gha-apply = {
      subjects = ["environment:dev"]
    }
  }
}

run "roles" {
  assert {
    condition     = strcontains(data.aws_iam_policy_document.trust["tftest-gha-plan"].json, "repo:RomaLoginovskiy/cms_demo:pull_request")
    error_message = "Trust is limited to the repository and the role's token subjects."
  }

  assert {
    condition     = !strcontains(data.aws_iam_policy_document.trust["tftest-gha-apply"].json, "pull_request")
    error_message = "The apply role must not trust pull_request tokens."
  }

  assert {
    condition     = strcontains(data.aws_iam_policy_document.trust["tftest-gha-apply"].json, "sts.amazonaws.com")
    error_message = "Tokens must carry the sts.amazonaws.com audience."
  }

  assert {
    condition     = keys(aws_iam_role_policy_attachment.this) == ["tftest-gha-plan/readonly"]
    error_message = "Managed policies attach per role."
  }

  assert {
    condition     = output.provider_arn == aws_iam_openid_connect_provider.github[0].arn
    error_message = "The module creates the GitHub OIDC provider when asked."
  }
}
