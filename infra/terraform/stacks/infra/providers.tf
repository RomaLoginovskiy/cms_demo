# One provider block for AWS and floci. On AWS aws_endpoint_url is null and every endpoint
# falls back to the provider default; on floci all services point at the emulator.
locals {
  emulated = var.aws_endpoint_url != null

  tags = {
    Project     = var.project
    Environment = var.env
    ManagedBy   = "terraform"
    Repository  = var.repository
    Owner       = var.owner
  }
}

provider "aws" {
  region              = var.region
  allowed_account_ids = local.emulated ? null : [var.account_id]

  s3_use_path_style           = local.emulated
  skip_credentials_validation = local.emulated
  skip_metadata_api_check     = local.emulated
  skip_requesting_account_id  = local.emulated

  endpoints {
    acm                    = var.aws_endpoint_url
    applicationautoscaling = var.aws_endpoint_url
    backup                 = var.aws_endpoint_url
    budgets                = var.aws_endpoint_url
    cloudwatch             = var.aws_endpoint_url
    dynamodb               = var.aws_endpoint_url
    ec2                    = var.aws_endpoint_url
    ecr                    = var.aws_endpoint_url
    eks                    = var.aws_endpoint_url
    elasticache            = var.aws_endpoint_url
    elbv2                  = var.aws_endpoint_url
    iam                    = var.aws_endpoint_url
    kafka                  = var.aws_endpoint_url
    kms                    = var.aws_endpoint_url
    logs                   = var.aws_endpoint_url
    opensearch             = var.aws_endpoint_url
    rds                    = var.aws_endpoint_url
    route53                = var.aws_endpoint_url
    s3                     = var.aws_endpoint_url
    secretsmanager         = var.aws_endpoint_url
    ssm                    = var.aws_endpoint_url
    sts                    = var.aws_endpoint_url
  }

  default_tags {
    tags = local.tags
  }
}
