output "certificate_arn" {
  description = "Validated ACM certificate ARN for the NLB TLS listener"
  value       = aws_acm_certificate_validation.this.certificate_arn
}

output "zone_id" {
  description = "Hosted zone ID"
  value       = local.zone_id
}

output "zone_arn" {
  description = "Hosted zone ARN (scopes the external-dns role)"
  value       = local.zone_arn
}

output "zone_name" {
  description = "Hosted zone name"
  value       = var.zone_name
}

output "fqdn" {
  description = "Public hostname"
  value       = var.hostname
}
