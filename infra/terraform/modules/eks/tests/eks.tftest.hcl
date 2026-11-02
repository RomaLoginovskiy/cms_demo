# Module test against floci (make tf-test); see modules/ecr/tests for the provider pinning.
# Plan only: an apply would start a second k3s cluster. The full apply is covered by `make local-apply`
# and fitness function F1/F2. An AWS-mode plan cannot run here either, because floci's add-on catalog
# stops at Kubernetes 1.32 (gap G15).
provider "aws" {
  region              = "eu-west-1"
  allowed_account_ids = ["000000000000"]
}

variables {
  name                         = "tftest-eks"
  vpc_id                       = "vpc-0123456789abcdef0"
  node_subnet_ids              = ["subnet-0000000000000000a", "subnet-0000000000000000b"]
  control_plane_subnet_ids     = ["subnet-0000000000000000a", "subnet-0000000000000000b", "subnet-0000000000000000c"]
  endpoint_public_access_cidrs = ["203.0.113.10/32"]
  emulator                     = "floci"
  node_group = {
    instance_types = ["m7gd.2xlarge"]
    min_size       = 1
    max_size       = 1
    desired_size   = 1
  }
  irsa_roles = {
    eso_app = { namespace = "external-secrets", service_account = "eso-app" }
  }
}

run "unknown_emulator_rejected" {
  command = plan

  variables {
    emulator = "localstack"
  }

  expect_failures = [var.emulator]
}

run "floci_plan" {
  command = plan

  assert {
    condition     = length(module.eks.cluster_addons) == 0
    error_message = "No EKS-managed add-ons on floci (gaps G2, G15)."
  }

  assert {
    condition     = module.irsa["eso_app"].name == "tftest-eks-eso-app"
    error_message = "IRSA roles are named <cluster>-<component> with dashes."
  }

  assert {
    condition     = module.ebs_csi_irsa.name == "tftest-eks-ebs-csi-driver"
    error_message = "The EBS CSI driver gets its own IRSA role."
  }
}
