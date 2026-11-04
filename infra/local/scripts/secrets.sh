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

# One region setting for everything that talks to Coralogix: collectors, browser RUM, Argo CD
# annotations (ADR-025), tf.sh. Each Coralogix secret carries it as DOMAIN, next to its key.
domain="${CX_DOMAIN:-eu1.coralogix.com}"
case "$domain" in
  *://*|*/*|api.*|ingress.*|"") die "CX_DOMAIN must be the bare region domain, such as eu1.coralogix.com (got '$domain')" ;;
esac

# set_props <secret> KEY=value...: sets those properties of the secret's JSON and keeps the others,
# so a key that is not in the file stays as it is when only DOMAIN changes.
set_props() {
  local name="$1" current
  shift
  current="$(aws secretsmanager get-secret-value --endpoint-url "$FLOCI_URL" \
    --secret-id "$PROJECT/local/$name" --query SecretString --output text 2>/dev/null || echo '{}')"
  aws secretsmanager put-secret-value --endpoint-url "$FLOCI_URL" \
    --secret-id "$PROJECT/local/$name" --secret-string "$(python3 -I -c '
import json, sys
try:
    d = json.loads(sys.argv[1])
except ValueError:
    d = {}
for pair in sys.argv[2:]:
    k, v = pair.split("=", 1)
    d[k] = v
print(json.dumps(d))' "$current" "$@")" >/dev/null
  log "updated secret $PROJECT/local/$name ($(printf '%s ' "${@%%=*}"| sed 's/ $//'))"
}

ingest=(DOMAIN="$domain"); [ -n "${CORALOGIX_PRIVATE_KEY:-}" ] && ingest+=(PRIVATE_KEY="$CORALOGIX_PRIVATE_KEY")
rum=(DOMAIN="$domain"); [ -n "${CORALOGIX_RUM_PUBLIC_KEY:-}" ] && rum+=(RUM_PUBLIC_KEY="$CORALOGIX_RUM_PUBLIC_KEY")
# Annotations from Argo CD (ADR-025); tf.sh reads the same variables for Terraform events.
events=(DOMAIN="$domain"); [ -n "${CX_OPS_EVENTS_API_KEY:-}" ] && events+=(API_KEY="$CX_OPS_EVENTS_API_KEY")
set_props coralogix-ingest "${ingest[@]}"
set_props coralogix-rum "${rum[@]}"
set_props coralogix-ops-events "${events[@]}"
[ -n "${LLM_API_KEY:-}" ] && set_props llm API_KEY="$LLM_API_KEY"
# ExternalSecrets refresh hourly; ask for an immediate refresh when the cluster is already up.
# Reloader then restarts the workloads that read the changed Secrets.
if [ -f "$KUBECONFIG_LOCAL" ]; then
  for es in $(kubectl_local get externalsecrets -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{" "}{end}' 2>/dev/null); do
    kubectl_local -n "${es%/*}" annotate externalsecret "${es#*/}" "force-sync=$(date +%s)" --overwrite >/dev/null
  done
  log "ExternalSecrets asked to refresh now"
fi
exit 0
