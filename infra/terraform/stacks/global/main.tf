# Once per account: container registry, CI identity and the budget alarm.

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account   = data.aws_caller_identity.current.account_id
  partition = data.aws_partition.current.partition

  # Name patterns (not resource attributes) keep these policies known at plan time.
  ecr_repository_pattern = "arn:${local.partition}:ecr:${var.region}:${local.account}:repository/${var.project}/*"
  state_bucket_arn       = "arn:${local.partition}:s3:::${var.state_bucket_name}"
}

module "ecr" {
  source = "../../modules/ecr"

  prefix       = var.project
  force_delete = var.ecr_force_delete
  tags         = local.tags
}

data "aws_iam_policy_document" "ecr_push" {
  statement {
    sid       = "Login"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "PushAndInspect"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:DescribeRepositories",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [local.ecr_repository_pattern]
  }
}

data "aws_iam_policy_document" "tf_state_plan" {
  statement {
    sid       = "ListState"
    actions   = ["s3:ListBucket"]
    resources = [local.state_bucket_arn]
  }

  statement {
    sid       = "ReadState"
    actions   = ["s3:GetObject"]
    resources = ["${local.state_bucket_arn}/*"]
  }

  # `terraform plan` takes the S3 lock: it writes and deletes <key>.tflock.
  statement {
    sid       = "LockState"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.state_bucket_arn}/*.tflock"]
  }
}

module "github_oidc" {
  source = "../../modules/github-oidc"
  count  = var.enable_github_oidc ? 1 : 0

  repository      = var.repository
  create_provider = var.create_github_oidc_provider

  roles = {
    "${var.project}-gha-ecr-push" = {
      subjects           = ["ref:refs/heads/main"]
      inline_policy_json = data.aws_iam_policy_document.ecr_push.json
    }
    "${var.project}-gha-tf-plan" = {
      subjects           = ["pull_request", "ref:refs/heads/main"]
      policy_arns        = { readonly = "arn:${local.partition}:iam::aws:policy/ReadOnlyAccess" }
      inline_policy_json = data.aws_iam_policy_document.tf_state_plan.json
    }
    # Used only by the protected GitHub environments; narrow it before prod (phase 4).
    "${var.project}-gha-tf-apply" = {
      subjects    = ["environment:dev", "environment:prod"]
      policy_arns = { admin = "arn:${local.partition}:iam::aws:policy/AdministratorAccess" }
    }
  }

  tags = local.tags
}

module "budget" {
  source = "../../modules/budget"

  name                = "${var.project}-monthly"
  limit_usd           = var.budget_limit_usd
  notification_emails = var.budget_notification_emails
  tags                = local.tags
}
