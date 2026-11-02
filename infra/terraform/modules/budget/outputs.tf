output "budget_name" {
  description = "Budget name, or null when disabled"
  value       = try(aws_budgets_budget.this[0].name, null)
}
