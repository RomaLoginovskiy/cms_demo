variable "name" {
  description = "Name prefix for the VPC and its resources"
  type        = string
}

variable "cidr" {
  description = "VPC CIDR block (a /16; subnets are carved from it)"
  type        = string
}

variable "azs" {
  description = "Availability zones, in order a/b/c"
  type        = list(string)
}

variable "single_nat_gateway" {
  description = "One NAT gateway for the whole VPC (cheaper) instead of one per AZ"
  type        = bool
  default     = true
}

variable "enable_interface_endpoints" {
  description = "Create interface VPC endpoints for the services in interface_endpoint_services"
  type        = bool
  default     = false
}

variable "interface_endpoint_services" {
  description = "Interface endpoint service names (suffix after com.amazonaws.<region>.)"
  type        = list(string)
  default     = ["ecr.api", "ecr.dkr", "sts", "secretsmanager", "ssm", "logs"]
}

variable "tags" {
  description = "Tags applied to every resource"
  type        = map(string)
  default     = {}
}
