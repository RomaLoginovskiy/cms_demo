variable "name" {
  description = "Cluster name (cms-demo-<env>)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "Intra subnets for brokers; their count must divide broker_count (2 subnets for 2 brokers in dev)"
  type        = list(string)
}

variable "client_security_group_ids" {
  description = "Security groups allowed to connect (the EKS node security group)"
  type        = list(string)
}

variable "kafka_version" {
  description = "MSK Kafka version; confirm availability with `aws kafka list-kafka-versions`"
  type        = string
  default     = "3.9.x"
}

variable "broker_instance_type" {
  description = "Broker instance type (smallest supported by the chosen version)"
  type        = string
  default     = "kafka.t3.small"
}

variable "broker_count" {
  description = "Number of broker nodes"
  type        = number
  default     = 2
}

variable "volume_size" {
  description = "EBS volume size per broker in GiB"
  type        = number
  default     = 20
}

variable "client_broker_encryption" {
  description = "TLS_PLAINTEXT in phase 1-2 (clients have no TLS settings yet), TLS after ADR-020 phase 3.1"
  type        = string
  default     = "TLS_PLAINTEXT"
}

variable "default_replication_factor" {
  description = "Broker default replication factor (topics are still created explicitly by the topics Job)"
  type        = number
  default     = 2
}

variable "tags" {
  description = "Tags applied to every resource"
  type        = map(string)
  default     = {}
}
