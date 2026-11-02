env              = "local"
account_id       = "000000000000"
aws_endpoint_url = "http://localhost:4566"
emulator         = "floci"

cluster_name = "cms-local"
vpc_cidr     = "10.10.0.0/16"
admin_cidrs  = ["0.0.0.0/0"]

# floci runs one k3s container per cluster; the first node group's type sizes it (capped by
# FLOCI_SERVICES_EKS_MAX_* in infra/local/docker-compose.yml). The type must exist in floci's EC2
# catalog (m5.2xlarge does not; Graviton m7gd.2xlarge does), otherwise floci falls back to m5.large.
node_group = {
  instance_types = ["m7gd.2xlarge"]
  min_size       = 1
  max_size       = 1
  desired_size   = 1
}

# floci backs MSK with a single Redpanda container.
kafka_replication_factor = 1

enable_edge = false
