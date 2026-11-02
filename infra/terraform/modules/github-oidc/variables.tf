variable "repository" {
  description = "GitHub repository allowed to assume the roles (owner/name)"
  type        = string
}

variable "create_provider" {
  description = "Create the token.actions.githubusercontent.com OIDC provider (one per account)"
  type        = bool
  default     = true
}

variable "roles" {
  description = "Roles keyed by IAM role name; subjects are the part after repo:<owner>/<name>: in the token sub claim"
  type = map(object({
    subjects           = list(string)
    policy_arns        = optional(map(string), {})
    inline_policy_json = optional(string)
  }))
}

variable "tags" {
  description = "Tags applied to every resource"
  type        = map(string)
  default     = {}
}
