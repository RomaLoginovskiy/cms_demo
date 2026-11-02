terraform {
  # Local stacks run on 1.6+; the AWS backend's use_lockfile needs 1.10+ (CI pins 1.17.x).
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.71"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.3"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.4"
    }
  }

  backend "s3" {}
}
