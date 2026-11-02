output "kms_key_arn" {
  description = "KMS key encrypting the application secrets"
  value       = aws_kms_key.app.arn
}

output "parameter_names" {
  description = "Full SSM parameter names keyed like var.parameters"
  value       = { for k, p in aws_ssm_parameter.this : k => p.name }
}

output "secret_arns" {
  description = "Secret ARNs keyed like var.secrets"
  value       = { for k, s in aws_secretsmanager_secret.this : k => s.arn }
}

output "reader_policy_json" {
  description = "IAM policy JSON per ESO reader scope (attach to the matching IRSA role)"
  value       = { for k, d in data.aws_iam_policy_document.eso : k => d.json }
}
