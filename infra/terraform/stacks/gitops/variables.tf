variable "cluster_name" {
  description = "EKS cluster name (cms-<env>)"
  type        = string
}

variable "argocd_chart_version" {
  description = "argo-cd chart version (keep equal to deploy/argocd/applicationsets/argo-cd.yaml)"
  type        = string
  default     = "10.11.6"
}

variable "gitops_repo_url" {
  description = "Repository Argo CD reads (public, no credentials needed)"
  type        = string
  default     = "https://github.com/RomaLoginovskiy/cms_demo.git"
}

variable "gitops_revision" {
  description = "Branch or tag tracked by this cluster (local: your branch; dev: main)"
  type        = string
  default     = "main"
}

variable "aws_endpoint_url_in_cluster" {
  description = "Emulator endpoint as seen from pods (http://floci:4566); null on AWS"
  type        = string
  default     = null
}
