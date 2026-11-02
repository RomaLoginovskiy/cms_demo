variable "name" {
  description = "Cluster name (cms-<env>)"
  type        = string
}

variable "kubernetes_version" {
  description = "EKS Kubernetes minor version; floci must be able to start a k3s image for it"
  type        = string
  default     = "1.37"
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "node_subnet_ids" {
  description = "Private subnets for the managed node group (AZs a/b in dev)"
  type        = list(string)
}

variable "control_plane_subnet_ids" {
  description = "Private subnets for the control-plane ENIs (all AZs)"
  type        = list(string)
}

variable "service_ipv4_cidr" {
  description = "Kubernetes service CIDR (same in every environment)"
  type        = string
  default     = "10.100.0.0/16"
}

variable "endpoint_public_access_cidrs" {
  description = "CIDRs allowed to reach the public cluster endpoint (admin_cidrs)"
  type        = list(string)
}

variable "admin_principal_arns" {
  description = "IAM principals granted AmazonEKSClusterAdminPolicy via access entries (besides the Terraform caller)"
  type        = list(string)
  default     = []
}

variable "readonly_principal_arns" {
  description = "IAM principals granted AmazonEKSViewPolicy via access entries"
  type        = list(string)
  default     = []
}

variable "node_group" {
  description = "Default managed node group settings"
  type = object({
    ami_type       = optional(string, "AL2023_ARM_64_STANDARD")
    instance_types = list(string)
    capacity_type  = optional(string, "ON_DEMAND")
    min_size       = number
    max_size       = number
    desired_size   = number
    disk_size      = optional(number, 50)
  })
}

variable "irsa_roles" {
  description = "IRSA roles keyed by component; each trusts exactly one namespace/service account"
  type = map(object({
    namespace                              = string
    service_account                        = string
    policy_arns                            = optional(map(string), {})
    create_inline_policy                   = optional(bool, false)
    inline_policy_json                     = optional(string)
    attach_load_balancer_controller_policy = optional(bool, false)
    attach_external_dns_policy             = optional(bool, false)
    external_dns_hosted_zone_arns          = optional(list(string), [])
  }))
  default = {}
}

variable "emulator" {
  description = "\"floci\" when running against the local emulator, otherwise \"none\"; see terraform-infrastructure.md for the only allowed differences"
  type        = string
  default     = "none"

  validation {
    condition     = contains(["floci", "none"], var.emulator)
    error_message = "emulator must be \"floci\" or \"none\"."
  }
}

variable "log_retention_days" {
  description = "CloudWatch retention for control-plane logs"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags applied to every resource"
  type        = map(string)
  default     = {}
}
