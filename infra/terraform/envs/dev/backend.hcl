# S3 backend with S3-native locking (Terraform >= 1.10). The bucket comes from the bootstrap stack:
#   cms-demo-tfstate-<account>-eu-west-1
bucket       = "cms-demo-tfstate-REPLACE_WITH_ACCOUNT_ID-eu-west-1"
region       = "eu-west-1"
use_lockfile = true
encrypt      = true
