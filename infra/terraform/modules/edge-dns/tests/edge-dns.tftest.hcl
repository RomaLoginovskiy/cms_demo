# Module test against floci (make tf-test); see modules/ecr/tests for the provider pinning.
# floci's ACM issues certificates from its local CA (gap G11), so DNS validation completes here.
provider "aws" {
  region              = "eu-west-1"
  allowed_account_ids = ["000000000000"]
}

variables {
  zone_name   = "tftest.example"
  hostname    = "cms.tftest.example"
  create_zone = true
}

run "zone_and_certificate" {
  assert {
    condition     = output.fqdn == "cms.tftest.example"
    error_message = "The certificate covers the public hostname."
  }

  assert {
    condition     = aws_acm_certificate.this.validation_method == "DNS"
    error_message = "Certificates validate through Route 53 records."
  }

  assert {
    condition     = output.zone_id == aws_route53_zone.this[0].zone_id
    error_message = "A created zone is the one the records go into."
  }
}
