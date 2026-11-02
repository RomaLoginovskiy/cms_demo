#!/usr/bin/env bash
# Creates IAM user local-admin with an access key and writes the cms-local AWS CLI profile.
# floci's EKS token webhook grants cluster-admin and deliberately rejects test/test and floci/floci.
. "$(dirname "$0")/lib.sh"

mkdir -p "$AWS_DIR"
if [ -f "$AWS_DIR/credentials" ]; then
  if (use_identity; aws sts get-caller-identity >/dev/null 2>&1); then
    log "local identity already valid ($AWS_DIR)"
    exit 0
  fi
  warn "stored local identity is no longer valid; recreating"
fi

aws_bootstrap iam get-user --user-name local-admin >/dev/null 2>&1 || \
  aws_bootstrap iam create-user --user-name local-admin >/dev/null
aws_bootstrap iam attach-user-policy --user-name local-admin \
  --policy-arn "arn:aws:iam::aws:policy/AdministratorAccess" >/dev/null

keys="$(aws_bootstrap iam create-access-key --user-name local-admin \
  --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)"
key_id="$(printf '%s' "$keys" | awk '{print $1}')"
secret="$(printf '%s' "$keys" | awk '{print $2}')"
[ -n "$key_id" ] && [ -n "$secret" ] || die "could not create an access key for local-admin"

umask 077
cat > "$AWS_DIR/credentials" <<CREDS
[cms-local]
aws_access_key_id = $key_id
aws_secret_access_key = $secret
CREDS
cat > "$AWS_DIR/config" <<CONF
[profile cms-local]
region = $REGION
output = json
endpoint_url = $FLOCI_URL
CONF
log "wrote AWS profile cms-local to $AWS_DIR (gitignored)"
