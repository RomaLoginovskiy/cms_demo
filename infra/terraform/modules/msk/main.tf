resource "aws_security_group" "msk" {
  name        = "${var.name}-msk"
  description = "Kafka listeners reachable from the cluster nodes only"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, { Name = "${var.name}-msk" })
}

resource "aws_vpc_security_group_ingress_rule" "kafka" {
  for_each = { for i, sg in var.client_security_group_ids : tostring(i) => sg }

  security_group_id            = aws_security_group.msk.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 9092
  to_port                      = 9098
  description                  = "Kafka plaintext/TLS/IAM listeners from cluster nodes"
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.msk.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
  description       = "Broker egress"
}

module "msk" {
  source  = "terraform-aws-modules/msk-kafka-cluster/aws"
  version = "~> 3.3"

  name                   = var.name
  kafka_version          = var.kafka_version
  number_of_broker_nodes = var.broker_count

  # MSK requires broker_count to be a multiple of the number of client subnets.
  broker_node_client_subnets  = var.subnet_ids
  broker_node_instance_type   = var.broker_instance_type
  broker_node_security_groups = [aws_security_group.msk.id]
  broker_node_storage_info = {
    ebs_storage_info = { volume_size = var.volume_size }
  }

  encryption_in_transit_client_broker = var.client_broker_encryption
  encryption_in_transit_in_cluster    = true
  client_authentication = {
    unauthenticated = true
  }

  # Avoids Application Auto Scaling resources (and an extra emulated API) for a demo-size cluster.
  enable_storage_autoscaling = false

  create_configuration = true
  configuration_name   = "${var.name}-config"
  configuration_server_properties = {
    "auto.create.topics.enable"  = "false"
    "default.replication.factor" = tostring(var.default_replication_factor)
    "min.insync.replicas"        = "1"
    "num.partitions"             = "3"
  }

  cloudwatch_logs_enabled = false

  tags = var.tags
}
