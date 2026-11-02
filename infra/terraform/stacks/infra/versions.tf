terraform {
  # Local stacks run on 1.6+; the AWS backend's use_lockfile needs 1.10+ (CI pins 1.17.x).
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.71"
    }
  }

  # Partial configuration: envs/<env>/backend.hcl + key=<env>/<stack>.tfstate (see infra/mk/terraform.mk).
  backend "s3" {}
}
