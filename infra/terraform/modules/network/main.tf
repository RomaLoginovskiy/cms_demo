data "aws_region" "current" {}

locals {
  # 10.x.0.0/24, 10.x.1.0/24, 10.x.2.0/24
  public_subnets = [for i, _ in var.azs : cidrsubnet(var.cidr, 8, i)]
  # 10.x.32.0/19, 10.x.64.0/19, 10.x.96.0/19 (nodes and VPC-CNI pod IPs)
  private_subnets = [for i, _ in var.azs : cidrsubnet(var.cidr, 3, i + 1)]
  # 10.x.10.0/24, 10.x.11.0/24, 10.x.12.0/24 (MSK, RDS, OpenSearch; no internet route)
  intra_subnets = [for i, _ in var.azs : cidrsubnet(var.cidr, 8, i + 10)]
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.7"

  name = var.name
  cidr = var.cidr
  azs  = var.azs

  public_subnets  = local.public_subnets
  private_subnets = local.private_subnets
  intra_subnets   = local.intra_subnets

  enable_nat_gateway     = true
  single_nat_gateway     = var.single_nat_gateway
  one_nat_gateway_per_az = !var.single_nat_gateway

  enable_dns_hostnames = true
  enable_dns_support   = true

  # AWS Load Balancer Controller subnet discovery
  public_subnet_tags  = { "kubernetes.io/role/elb" = "1" }
  private_subnet_tags = { "kubernetes.io/role/internal-elb" = "1" }

  tags = var.tags
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = module.vpc.vpc_id
  service_name      = "com.amazonaws.${data.aws_region.current.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = concat(module.vpc.private_route_table_ids, module.vpc.intra_route_table_ids)

  tags = merge(var.tags, { Name = "${var.name}-s3" })
}

resource "aws_security_group" "endpoints" {
  count = var.enable_interface_endpoints ? 1 : 0

  name        = "${var.name}-vpc-endpoints"
  description = "HTTPS from inside the VPC to interface endpoints"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTPS from the VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.cidr]
  }

  tags = var.tags
}

resource "aws_vpc_endpoint" "interface" {
  for_each = var.enable_interface_endpoints ? toset(var.interface_endpoint_services) : toset([])

  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.endpoints[0].id]

  tags = merge(var.tags, { Name = "${var.name}-${each.key}" })
}
