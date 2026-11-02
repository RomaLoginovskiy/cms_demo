output "ecr_registry" {
  description = "Registry prefix for image references (<registry>/cms-demo/<service>:<tag>)"
  value       = module.ecr.registry
}

output "ecr_repository_urls" {
  description = "Repository URLs keyed by service"
  value       = module.ecr.repository_urls
}

output "github_role_arns" {
  description = "CI role ARNs (set them as GitHub repository variables)"
  value       = try(module.github_oidc[0].role_arns, {})
}
