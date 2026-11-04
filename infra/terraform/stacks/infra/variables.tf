variable "emulator" {
  description = "\"floci\" for the local environment, \"none\" on AWS"
  type        = string
  default     = "none"
}

variable "cluster_name" {
  description = "EKS cluster name (cms-<env>)"
  type        = string
}

variable "kubernetes_version" {
  description = "EKS version, identical in every environment (fallback 1.36 everywhere if floci's k3s 1.37 misbehaves)"
  type        = string
  default     = "1.37"
}

variable "vpc_cidr" {
  description = "VPC CIDR (local 10.10.0.0/16, dev 10.20.0.0/16, prod 10.30.0.0/16)"
  type        = string
}

variable "azs" {
  description = "Three availability zones"
  type        = list(string)
  default     = ["eu-west-1a", "eu-west-1b", "eu-west-1c"]
}

variable "node_az_count" {
  description = "Number of AZs (from the start of azs) used by worker nodes"
  type        = number
  default     = 2
}

variable "msk_az_count" {
  description = "Number of AZs used by MSK brokers; must divide kafka_broker_count"
  type        = number
  default     = 2
}

variable "single_nat_gateway" {
  description = "One NAT gateway (dev) or one per AZ (prod)"
  type        = bool
  default     = true
}

variable "enable_interface_endpoints" {
  description = "Interface VPC endpoints (prod)"
  type        = bool
  default     = false
}

variable "admin_cidrs" {
  description = "CIDRs allowed to reach the public Kubernetes API endpoint"
  type        = list(string)
}

variable "admin_principal_arns" {
  description = "IAM roles/users with cluster-admin access entries (besides the Terraform caller)"
  type        = list(string)
  default     = []
}

variable "readonly_principal_arns" {
  description = "IAM roles/users with read-only access entries"
  type        = list(string)
  default     = []
}

variable "node_group" {
  description = "Default node group (instance type sizes the single k3s container on floci)"
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

variable "log_retention_days" {
  description = "Control-plane log retention"
  type        = number
  default     = 30
}

variable "kafka_version" {
  description = "MSK Kafka version"
  type        = string
  default     = "3.9.x"
}

variable "kafka_broker_instance_type" {
  description = "MSK broker instance type"
  type        = string
  default     = "kafka.t3.small"
}

variable "kafka_broker_count" {
  description = "MSK broker count (multiple of msk_az_count)"
  type        = number
  default     = 2
}

variable "kafka_replication_factor" {
  description = "Replication factor for topics created by the topics Job (1 on floci)"
  type        = number
  default     = 2
}

variable "enable_edge" {
  description = "Public edge on AWS: ACM certificate, hosted zone lookup, external-dns role"
  type        = bool
  default     = false
}

variable "public_hostname" {
  description = "Public hostname, e.g. cms-dev.example.com (Q3)"
  type        = string
  default     = null
}

variable "route53_zone_name" {
  description = "Hosted zone containing public_hostname (Q3)"
  type        = string
  default     = null
}

variable "create_route53_zone" {
  description = "Create the hosted zone instead of looking it up"
  type        = bool
  default     = false
}

variable "public_ingress_cidrs" {
  description = "Allowlist for the NLB (Q4); NAT EIPs are added automatically"
  type        = list(string)
  default     = []
}

variable "local_public_origin" {
  description = "Browser origin when there is no public edge (floci)"
  type        = string
  default     = "http://localhost:8080"
}

variable "llm_base_url" {
  description = "OpenAI-compatible captioning endpoint (Q5); placeholder keeps the worker running with captions disabled"
  type        = string
  default     = "http://llm.invalid/v1"
}

variable "llm_model" {
  description = "Captioning model name (Q5)"
  type        = string
  default     = "none"
}

variable "coralogix_domain" {
  description = "Coralogix region domain written as DOMAIN into the placeholder Coralogix secrets (tf.sh sets it from CX_DOMAIN); the real values are written with the keys"
  type        = string
  default     = "eu1.coralogix.com"
}

variable "secret_recovery_window_days" {
  description = "Secrets Manager recovery window (0 for local/dev)"
  type        = number
  default     = 0
}
