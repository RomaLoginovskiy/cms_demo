# Placeholders map to the open decisions in spec/architecture/aws-eks-delivery-plan.md:
# Q1 account, Q3 domain/zone, Q4 allowlist, Q5 captioning endpoint.
env        = "dev"
account_id = "REPLACE_WITH_ACCOUNT_ID"

cluster_name = "cms-dev"
vpc_cidr     = "10.20.0.0/16"

# Public Kubernetes API endpoint allowlist (operator addresses).
admin_cidrs = ["203.0.113.10/32"] # REPLACE: your admin egress CIDR(s)

admin_principal_arns    = [] # e.g. the IAM Identity Center admin role
readonly_principal_arns = []

node_group = {
  instance_types = ["m7g.xlarge"]
  min_size       = 2
  max_size       = 3
  desired_size   = 2
}

kafka_broker_count       = 2
kafka_replication_factor = 2

enable_edge          = true
route53_zone_name    = "REPLACE_WITH_DOMAIN"
public_hostname      = "cms-dev.REPLACE_WITH_DOMAIN"
public_ingress_cidrs = ["203.0.113.0/24"] # REPLACE (Q4); NAT EIPs are added automatically

# Q5: keep placeholders until the title bug is fixed and an endpoint is chosen.
llm_base_url = "http://llm.invalid/v1"
llm_model    = "none"
