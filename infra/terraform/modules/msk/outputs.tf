output "bootstrap_brokers" {
  description = "Plaintext bootstrap list (host:9092,...), used until clients support TLS"
  value       = module.msk.bootstrap_brokers_plaintext
}

output "bootstrap_brokers_tls" {
  description = "TLS bootstrap list (host:9094,...)"
  value       = module.msk.bootstrap_brokers_tls
}

output "arn" {
  description = "MSK cluster ARN"
  value       = module.msk.arn
}

output "security_group_id" {
  description = "Broker security group"
  value       = aws_security_group.msk.id
}
