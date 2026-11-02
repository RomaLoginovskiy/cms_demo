data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

locals {
  account   = data.aws_caller_identity.current.account_id
  partition = data.aws_partition.current.partition
  region    = data.aws_region.current.region

  parameter_prefix = "/${var.project}/${var.env}"
  secret_prefix    = "${var.project}/${var.env}"

  # Secrets Manager appends "-XXXXXX" to secret ARNs, hence the trailing wildcard.
  secret_arn_pattern    = "arn:${local.partition}:secretsmanager:${local.region}:${local.account}:secret:${local.secret_prefix}"
  parameter_arn_pattern = "arn:${local.partition}:ssm:${local.region}:${local.account}:parameter${local.parameter_prefix}"
}

resource "aws_kms_key" "app" {
  description             = "${var.project}-${var.env} application secrets"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  tags                    = var.tags
}

resource "aws_kms_alias" "app" {
  name          = "alias/${var.project}-${var.env}-app"
  target_key_id = aws_kms_key.app.key_id
}

# Coordinates published for Argo CD (gitops stack) and ESO. Values must never be empty.
resource "aws_ssm_parameter" "this" {
  for_each = var.parameters

  name  = "${local.parameter_prefix}/${each.key}"
  type  = "String"
  value = each.value
  tags  = var.tags
}

resource "aws_secretsmanager_secret" "this" {
  for_each = var.secrets

  name                    = "${local.secret_prefix}/${each.key}"
  kms_key_id              = aws_kms_key.app.arn
  recovery_window_in_days = var.secret_recovery_window_days
  tags                    = var.tags
}

# Placeholder versions keep every ExternalSecret resolvable on the first sync.
# Real values are written out of band (operator or `make local-secrets`) and never touch state again.
resource "aws_secretsmanager_secret_version" "placeholder" {
  for_each = var.secrets

  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = jsonencode(each.value)

  lifecycle {
    ignore_changes = [secret_string]
  }
}

data "aws_iam_policy_document" "eso" {
  for_each = var.reader_scopes

  statement {
    sid     = "ReadSecrets"
    effect  = "Allow"
    actions = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    # AWS matches the full ARN (name plus a random 6-character suffix, hence "-*"). floci's IAM
    # enforcement checks a by-name request against the ARN without the suffix (gap G25); that ARN
    # never names a real AWS secret, so listing it widens nothing on AWS.
    resources = flatten([for s in each.value.secrets : ["${local.secret_arn_pattern}/${s}-*", "${local.secret_arn_pattern}/${s}"]])
  }

  # Only for readers that need parameters; IAM rejects a statement without resources.
  dynamic "statement" {
    for_each = length(each.value.parameter_prefixes) > 0 ? [each.value.parameter_prefixes] : []
    content {
      sid       = "ReadParameters"
      effect    = "Allow"
      actions   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
      resources = flatten([for p in statement.value : ["${local.parameter_arn_pattern}/${p}", "${local.parameter_arn_pattern}/${p}/*"]])
    }
  }

  statement {
    sid       = "DecryptAppKey"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.app.arn]
  }
}
