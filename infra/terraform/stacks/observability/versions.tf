terraform {
  # import blocks with for_each (imports.tf) need 1.7+; CI pins 1.17.x.
  required_version = ">= 1.7.0"

  required_providers {
    coralogix = {
      source  = "coralogix/coralogix"
      version = "~> 3.23"
    }
  }

  # Partial configuration: envs/<env>/backend.hcl + key=<env>/<stack>.tfstate (see infra/mk/terraform.mk).
  backend "s3" {}
}
