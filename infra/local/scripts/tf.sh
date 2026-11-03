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

# The Coralogix provider of the observability stack reads CORALOGIX_API_KEY; for env local it may
# come from infra/local/.secrets.env.
if [ "$stack" = "observability" ] && [ -z "${CORALOGIX_API_KEY:-}" ] && [ "$env" = "local" ] \
  && [ -f "$LOCAL_DIR/.secrets.env" ]; then
  CORALOGIX_API_KEY="$(sed -n 's/^CORALOGIX_API_KEY=//p' "$LOCAL_DIR/.secrets.env" | tail -n1)"
  export CORALOGIX_API_KEY
fi

terraform -chdir="$dir" init -input=false -reconfigure \
  -backend-config="$env_dir/backend.hcl" \
  -backend-config="key=$env/$stack.tfstate" >/dev/null

case "$1" in
  apply|destroy)
    # Every apply/destroy that changes something becomes a Coralogix annotation (ADR-025). Key from
    # CX_OPS_EVENTS_API_KEY, or for env local from infra/local/.secrets.env; never fails the run.
    if [ "$env" = "local" ] && [ -z "${CX_OPS_EVENTS_API_KEY:-}" ] && [ -f "$LOCAL_DIR/.secrets.env" ]; then
      CX_OPS_EVENTS_API_KEY="$(sed -n 's/^CX_OPS_EVENTS_API_KEY=//p' "$LOCAL_DIR/.secrets.env" | tail -n1)"
      export CX_OPS_EVENTS_API_KEY
    fi
    tf_log="$(mktemp "${TMPDIR:-/tmp}/tf-$1.XXXXXX")"
    trap 'rm -f "$tf_log"' EXIT
    set +e
    terraform -chdir="$dir" "$@" -var-file="$env_dir/$stack.tfvars" 2>&1 | tee "$tf_log"
    rc="${PIPESTATUS[0]}"
    set -e
    "$ROOT/infra/scripts/ops-event.sh" terraform --env "$env" --stack "$stack" --action "$1" \
      --exit-code "$rc" --log "$tf_log" || warn "could not record the $1 in Coralogix"
    exit "$rc"
    ;;
  plan|refresh|import|console)
    terraform -chdir="$dir" "$@" -var-file="$env_dir/$stack.tfvars"
    ;;
  *)
    terraform -chdir="$dir" "$@"
    ;;
esac
