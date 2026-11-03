#!/usr/bin/env bash
# Writes real secret values from infra/local/.secrets.env into floci Secrets Manager.
# Without the file the Terraform placeholders stay (RUM off, export rejected, captioning off).
. "$(dirname "$0")/lib.sh"
use_identity

file="$LOCAL_DIR/.secrets.env"
if [ ! -f "$file" ]; then
  warn "no $file; keeping placeholder secrets (copy .secrets.env.example to send real telemetry)"
  exit 0
fi
set -a; . "$file"; set +a

put() {
  local name="$1" json="$2"
  aws secretsmanager put-secret-value --endpoint-url "$FLOCI_URL" \
    --secret-id "$PROJECT/local/$name" --secret-string "$json" >/dev/null
  log "updated secret $PROJECT/local/$name"
}

json() { python3 -I -c 'import json,sys; print(json.dumps({sys.argv[1]: sys.argv[2]}))' "$1" "$2"; }

[ -n "${CORALOGIX_PRIVATE_KEY:-}" ] && put coralogix-ingest "$(json PRIVATE_KEY "$CORALOGIX_PRIVATE_KEY")"
[ -n "${CORALOGIX_RUM_PUBLIC_KEY:-}" ] && put coralogix-rum "$(json RUM_PUBLIC_KEY "$CORALOGIX_RUM_PUBLIC_KEY")"
[ -n "${LLM_API_KEY:-}" ] && put llm "$(json API_KEY "$LLM_API_KEY")"
# Annotations from Argo CD (ADR-025); tf.sh reads the same variable for Terraform events.
[ -n "${CX_OPS_EVENTS_API_KEY:-}" ] && put coralogix-ops-events "$(json API_KEY "$CX_OPS_EVENTS_API_KEY")"
# ExternalSecrets refresh hourly; ask for an immediate refresh when the cluster is already up.
# Reloader then restarts the workloads that read the changed Secrets.
if [ -f "$KUBECONFIG_LOCAL" ]; then
  for es in $(kubectl_local get externalsecrets -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{" "}{end}' 2>/dev/null); do
    kubectl_local -n "${es%/*}" annotate externalsecret "${es#*/}" "force-sync=$(date +%s)" --overwrite >/dev/null
  done
  log "ExternalSecrets asked to refresh now"
fi
exit 0
