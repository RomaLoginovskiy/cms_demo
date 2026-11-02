resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_provider ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  tags           = var.tags
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_provider ? 0 : 1

  url = "https://token.actions.githubusercontent.com"
}

locals {
  provider_arn = var.create_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn

  # Flatten role => policy ARN attachments into a stable map.
  attachments = merge([
    for role, cfg in var.roles : {
      for name, arn in cfg.policy_arns : "${role}/${name}" => { role = role, arn = arn }
    }
  ]...)
}

data "aws_iam_policy_document" "trust" {
  for_each = var.roles

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # e.g. repo:RomaLoginovskiy/cms_demo:ref:refs/heads/main, repo:...:environment:dev, repo:...:pull_request
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [for s in each.value.subjects : "repo:${var.repository}:${s}"]
    }
  }
}

resource "aws_iam_role" "this" {
  for_each = var.roles

  name                 = each.key
  assume_role_policy   = data.aws_iam_policy_document.trust[each.key].json
  max_session_duration = 3600
  tags                 = var.tags
}

resource "aws_iam_role_policy_attachment" "this" {
  for_each = local.attachments

  role       = aws_iam_role.this[each.value.role].name
  policy_arn = each.value.arn
}

resource "aws_iam_role_policy" "inline" {
  for_each = { for role, cfg in var.roles : role => cfg if cfg.inline_policy_json != null }

  name   = "inline"
  role   = aws_iam_role.this[each.key].id
  policy = each.value.inline_policy_json
}
