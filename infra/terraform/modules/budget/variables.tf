variable "name" {
  description = "Budget name"
  type        = string
}

variable "limit_usd" {
  description = "Monthly limit in USD"
  type        = number
}

variable "notification_emails" {
  description = "Recipients for the 80 % actual and 100 % forecast alerts; empty disables the budget"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags applied to every resource"
  type        = map(string)
  default     = {}
}
