# Module test against floci (make tf-test); see modules/ecr/tests for the provider pinning.
provider "aws" {
  region              = "eu-west-1"
  allowed_account_ids = ["000000000000"]
}

variables {
  name = "tftest-net"
  cidr = "10.99.0.0/16"
  azs  = ["eu-west-1a", "eu-west-1b", "eu-west-1c"]
}

run "vpc" {
  assert {
    condition     = length(output.public_subnet_ids) == 3 && length(output.private_subnet_ids) == 3 && length(output.intra_subnet_ids) == 3
    error_message = "One public, private and intra subnet per AZ."
  }

  assert {
    condition     = output.vpc_cidr_block == "10.99.0.0/16"
    error_message = "VPC uses the given CIDR."
  }

  assert {
    condition     = length(output.nat_public_ips) == 1
    error_message = "single_nat_gateway (default) creates one NAT gateway."
  }

  assert {
    condition     = aws_vpc_endpoint.s3.vpc_endpoint_type == "Gateway"
    error_message = "S3 is reached through a gateway endpoint."
  }

  assert {
    condition     = length(aws_vpc_endpoint.interface) == 0
    error_message = "No interface endpoints unless enabled."
  }
}

run "nat_per_az_and_interface_endpoints" {
  command = plan

  variables {
    single_nat_gateway         = false
    enable_interface_endpoints = true
  }

  assert {
    condition     = length(output.nat_public_ips) == 3
    error_message = "One NAT gateway per AZ when single_nat_gateway is false (prod)."
  }

  assert {
    condition     = length(aws_vpc_endpoint.interface) == length(var.interface_endpoint_services) && length(aws_security_group.endpoints) == 1
    error_message = "Interface endpoints and their security group when enabled (prod)."
  }
}
