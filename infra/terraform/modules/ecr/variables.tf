variable "prefix" {
  description = "Repository namespace (repositories are <prefix>/<name>)"
  type        = string
  default     = "cms-demo"
}

variable "repositories" {
  description = "Repository names under the prefix (one per deployable)"
  type        = list(string)
  default     = ["cms-backend", "media-worker", "cms-frontend", "canvas-backend", "canvas-frontend", "canvas-load"]
}

variable "image_tag_mutability" {
  description = "IMMUTABLE in every environment (tags are sha-<12>)"
  type        = string
  default     = "IMMUTABLE"
}

variable "keep_last" {
  description = "Number of sha-* images to keep per repository"
  type        = number
  default     = 30
}

variable "force_delete" {
  description = "Allow deleting repositories that still contain images (local/dev only)"
  type        = bool
  default     = false
}

variable "pull_principal_arns" {
  description = "Other-account principals allowed to pull (prod cross-account pull, phase 4)"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags applied to every resource"
  type        = map(string)
  default     = {}
}
