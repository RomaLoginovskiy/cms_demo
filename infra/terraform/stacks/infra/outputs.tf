output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "Kubernetes API endpoint"
  value       = module.eks.cluster_endpoint
}

output "kafka_bootstrap_brokers" {
  description = "Kafka bootstrap list published to SSM"
  value       = module.msk.bootstrap_brokers
}

output "irsa_role_arns" {
  description = "IRSA roles published to SSM"
  value       = module.eks.irsa_role_arns
}

output "public_ingress_cidrs" {
  description = "NLB allowlist (Q4 + NAT EIPs)"
  value       = local.public_ingress_cidrs
}

output "kubeconfig_command" {
  description = "Command that writes a kubeconfig entry for this cluster"
  value       = "aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.region} --alias ${module.eks.cluster_name}"
}
