output "cluster_labels" {
  description = "GitOps Bridge labels on the Argo CD cluster Secret"
  value       = local.cluster_labels
}

output "cluster_annotations" {
  description = "GitOps Bridge annotations on the Argo CD cluster Secret"
  value       = local.cluster_annotations
}

output "argocd_ui" {
  description = "How to reach the Argo CD UI (no public route until SSO, phase 4)"
  value       = "kubectl -n argocd port-forward svc/argocd-server 8081:80, then http://localhost:8081 (user admin, password: kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d)"
}
