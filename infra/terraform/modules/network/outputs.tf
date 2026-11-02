output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "vpc_cidr_block" {
  description = "VPC CIDR block"
  value       = module.vpc.vpc_cidr_block
}

output "azs" {
  description = "Availability zones used by the subnets, in order"
  value       = var.azs
}

output "public_subnet_ids" {
  description = "Public subnet IDs (NLB, NAT), one per AZ in azs order"
  value       = module.vpc.public_subnets
}

output "private_subnet_ids" {
  description = "Private subnet IDs (nodes, pods), one per AZ in azs order"
  value       = module.vpc.private_subnets
}

output "intra_subnet_ids" {
  description = "Intra subnet IDs (managed data services), one per AZ in azs order"
  value       = module.vpc.intra_subnets
}

output "nat_public_ips" {
  description = "Public IPs of the NAT gateways (egress addresses of the cluster)"
  value       = module.vpc.nat_public_ips
}
