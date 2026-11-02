terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.71"
    }
  }

  # Local state on first apply; then `terraform init -migrate-state` with envs/<env>/backend.hcl
  # and key=bootstrap/terraform.tfstate moves it into the bucket it created.
}
