output "cluster_secret_name" {
  description = "Argo CD cluster Secret carrying the GitOps Bridge metadata"
  value       = kubernetes_secret_v1.cluster.metadata[0].name
}

output "argocd_namespace" {
  description = "Argo CD namespace"
  value       = var.namespace
}
