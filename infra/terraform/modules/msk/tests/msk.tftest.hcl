# Module test against floci (make tf-test); see modules/ecr/tests for the provider pinning.
# floci runs the cluster as a Redpanda container, so the apply run checks real bootstrap brokers.
provider "aws" {
  region              = "eu-west-1"
  allowed_account_ids = ["000000000000"]
}

run "network" {
  module {
    source = "../network"
  }

  variables {
    name = "tftest-msk"
    cidr = "10.98.0.0/16"
    azs  = ["eu-west-1a", "eu-west-1b"]
  }
}

run "cluster" {
  variables {
    name                       = "tftest-msk"
    vpc_id                     = run.network.vpc_id
    subnet_ids                 = run.network.intra_subnet_ids
    client_security_group_ids  = []
    broker_count               = 2
    default_replication_factor = 1
  }

  assert {
    condition     = length(regexall(":9092", output.bootstrap_brokers)) > 0
    error_message = "Plaintext bootstrap brokers are published (floci: Redpanda on 9092)."
  }

  assert {
    condition     = aws_security_group.msk.vpc_id == run.network.vpc_id
    error_message = "The broker security group lives in the given VPC."
  }

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.kafka) == 0
    error_message = "No ingress without client security groups."
  }
}

run "client_access" {
  command = plan

  variables {
    name                      = "tftest-msk"
    vpc_id                    = run.network.vpc_id
    subnet_ids                = run.network.intra_subnet_ids
    client_security_group_ids = ["sg-0123456789abcdef0"]
    broker_count              = 2
  }

  assert {
    condition = alltrue([for r in aws_vpc_security_group_ingress_rule.kafka :
    r.from_port == 9092 && r.to_port == 9098 && r.referenced_security_group_id == "sg-0123456789abcdef0"])
    error_message = "Clients reach every Kafka listener (9092-9098) only from the referenced security groups."
  }
}
