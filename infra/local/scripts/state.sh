#!/usr/bin/env bash
# Terraform state bucket and lock table on floci (envs/local/backend.hcl).
. "$(dirname "$0")/lib.sh"

bucket="$PROJECT-tfstate-local"
table="$PROJECT-tflock-local"

if aws_local s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
  log "state bucket $bucket exists"
else
  aws_local s3api create-bucket --bucket "$bucket" \
    --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  aws_local s3api put-bucket-versioning --bucket "$bucket" \
    --versioning-configuration Status=Enabled >/dev/null
  log "created state bucket $bucket"
fi

if aws_local dynamodb describe-table --table-name "$table" >/dev/null 2>&1; then
  log "lock table $table exists"
else
  aws_local dynamodb create-table --table-name "$table" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST >/dev/null
  log "created lock table $table"
fi
