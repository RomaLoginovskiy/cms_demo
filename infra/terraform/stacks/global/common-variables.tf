variable "project" {
  description = "Project prefix"
  type        = string
  default     = "cms-demo"
}

variable "env" {
  description = "Environment: local, dev or prod"
  type        = string

  validation {
    condition     = contains(["local", "dev", "prod"], var.env)
    error_message = "env must be local, dev or prod."
  }
}

variable "region" {
  description = "AWS region (also floci's default region)"
  type        = string
  default     = "eu-west-1"
}

variable "account_id" {
  description = "Expected AWS account ID (guards against applying to the wrong account); ignored on floci"
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id must be a 12-digit AWS account ID (set it in envs/<env>/*.tfvars)."
  }
}

variable "aws_endpoint_url" {
  description = "Emulator endpoint as seen from the machine running Terraform (http://localhost:4566 for floci); null on AWS"
  type        = string
  default     = null
}

variable "repository" {
  description = "GitHub repository (owner/name)"
  type        = string
  default     = "RomaLoginovskiy/cms_demo"
}

variable "owner" {
  description = "Owner tag value (Q9)"
  type        = string
  default     = "RomaLoginovskiy"
}
