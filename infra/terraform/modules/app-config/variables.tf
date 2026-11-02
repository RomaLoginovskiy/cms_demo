variable "project" {
  description = "Project prefix for parameter and secret names"
  type        = string
  default     = "cms-demo"
}

variable "env" {
  description = "Environment name (local, dev, prod)"
  type        = string
}

variable "parameters" {
  description = "SSM String parameters relative to /<project>/<env>/ (for example kafka/bootstrap_brokers). Values must be non-empty."
  type        = map(string)

  validation {
    condition     = alltrue([for v in values(var.parameters) : v != ""])
    error_message = "SSM parameters cannot be empty; use an explicit placeholder."
  }
}

variable "secrets" {
  description = "Secrets relative to <project>/<env>/ mapped to their placeholder JSON object (keys = Secret keys)"
  type        = map(map(string))
}

variable "reader_scopes" {
  description = "Read scopes for ESO roles: secret names and parameter prefixes each reader may access"
  type = map(object({
    secrets            = list(string)
    parameter_prefixes = list(string)
  }))
}

variable "secret_recovery_window_days" {
  description = "0 deletes immediately (local/dev); 7-30 in prod"
  type        = number
  default     = 0
}

variable "tags" {
  description = "Tags applied to every resource"
  type        = map(string)
  default     = {}
}
