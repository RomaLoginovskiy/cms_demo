variable "state_bucket_name" {
  description = "Terraform state bucket (from the bootstrap stack); scopes the plan role"
  type        = string
}

variable "ecr_force_delete" {
  description = "Allow deleting repositories that still hold images (local only)"
  type        = bool
  default     = false
}

variable "enable_github_oidc" {
  description = "Create the GitHub OIDC provider and CI roles (AWS only)"
  type        = bool
  default     = true
}

variable "create_github_oidc_provider" {
  description = "Create the account's GitHub OIDC provider (false if it already exists)"
  type        = bool
  default     = true
}

variable "budget_limit_usd" {
  description = "Monthly budget"
  type        = number
  default     = 600
}

variable "budget_notification_emails" {
  description = "Budget alert recipients; empty disables the budget (Q9)"
  type        = list(string)
  default     = []
}
