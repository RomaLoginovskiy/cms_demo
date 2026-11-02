output "role_arns" {
  description = "Role ARNs keyed by role name"
  value       = { for k, r in aws_iam_role.this : k => r.arn }
}

output "provider_arn" {
  description = "GitHub OIDC provider ARN"
  value       = local.provider_arn
}
