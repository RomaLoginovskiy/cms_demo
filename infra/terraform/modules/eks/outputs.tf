output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "Kubernetes API endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64-encoded cluster CA"
  value       = module.eks.cluster_certificate_authority_data
}

output "oidc_provider_arn" {
  description = "IAM OIDC provider ARN used by IRSA trust policies"
  value       = module.eks.oidc_provider_arn
}

output "oidc_issuer_url" {
  description = "Cluster OIDC issuer URL"
  value       = module.eks.cluster_oidc_issuer_url
}

output "node_security_group_id" {
  description = "Security group shared by all nodes (client SG for MSK/RDS/OpenSearch)"
  value       = module.eks.node_security_group_id
}

output "cluster_security_group_id" {
  description = "Cluster security group"
  value       = module.eks.cluster_security_group_id
}

output "irsa_role_arns" {
  description = "IRSA role ARNs keyed like var.irsa_roles"
  value       = { for k, m in module.irsa : k => m.arn }
}
