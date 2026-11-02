variable "cluster_name" {
  description = "Cluster name (Argo CD cluster name and Secret suffix)"
  type        = string
}

variable "namespace" {
  description = "Argo CD namespace"
  type        = string
  default     = "argocd"
}

variable "argocd_chart_version" {
  description = "argo-cd chart version; must match deploy/argocd/applicationsets/argo-cd.yaml"
  type        = string
  default     = "10.11.6"
}

variable "argocd_apps_chart_version" {
  description = "argocd-apps chart version used for the root Application"
  type        = string
  default     = "2.0.7"
}

variable "argocd_values" {
  description = "Helm values documents for the bootstrap install (same files Argo CD uses for self-management)"
  type        = list(string)
}

variable "repo_url" {
  description = "Git repository Argo CD reads"
  type        = string
}

variable "revision" {
  description = "Git revision for the root Application"
  type        = string
}

variable "root_path" {
  description = "Path of the root Application (AppProjects + ApplicationSets)"
  type        = string
  default     = "deploy/argocd"
}

variable "cluster_labels" {
  description = "GitOps Bridge labels (environment, cloud, feature flags)"
  type        = map(string)
}

variable "cluster_annotations" {
  description = "GitOps Bridge annotations (AWS identifiers, role ARNs, registry, revision)"
  type        = map(string)
}
