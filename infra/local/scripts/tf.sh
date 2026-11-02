#!/usr/bin/env bash
# Runs a Terraform stack for an environment: tf.sh <env> <stack> <terraform args...>
# Each env gets its own TF_DATA_DIR, so switching environments never re-uses another backend.
. "$(dirname "$0")/lib.sh"

[ $# -ge 3 ] || die "usage: tf.sh <env> <global|infra|gitops> <terraform command> [args...]"
env="$1"; stack="$2"; shift 2

dir="$TF_DIR/stacks/$stack"
env_dir="$TF_DIR/envs/$env"
[ -d "$dir" ] || die "unknown stack $stack"
[ -f "$env_dir/$stack.tfvars" ] || die "missing $env_dir/$stack.tfvars"

export TF_DATA_DIR="$dir/.terraform-$env"
[ "$env" = "local" ] && use_identity

terraform -chdir="$dir" init -input=false -reconfigure \
  -backend-config="$env_dir/backend.hcl" \
  -backend-config="key=$env/$stack.tfstate" >/dev/null

case "$1" in
  plan|apply|destroy|refresh|import|console)
    terraform -chdir="$dir" "$@" -var-file="$env_dir/$stack.tfvars"
    ;;
  *)
    terraform -chdir="$dir" "$@"
    ;;
esac
