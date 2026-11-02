# floci S3 backend with DynamoDB locking (floci's documented pattern). Created by `make local-state`.
bucket                      = "cms-demo-tfstate-local"
region                      = "eu-west-1"
dynamodb_table              = "cms-demo-tflock-local"
encrypt                     = true
use_path_style              = true
skip_credentials_validation = true
skip_requesting_account_id  = true
skip_metadata_api_check     = true
skip_region_validation      = true
endpoints = {
  s3       = "http://localhost:4566"
  dynamodb = "http://localhost:4566"
  iam      = "http://localhost:4566"
  sts      = "http://localhost:4566"
}
