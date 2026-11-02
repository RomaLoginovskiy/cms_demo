#!/usr/bin/env bash
# Removes what controllers created outside Terraform, in an order that lets them clean up:
# app + edge first (AWS LBC deletes the NLB while it still runs), then PVCs, then the remaining
# add-ons, finally the argo-cd Application without cascade. Usage: predestroy.sh <env>
. "$(dirname "$0")/lib.sh"

env="${1:-local}"
if [ "$env" = "local" ]; then
  kc() { kubectl_local "$@"; }
else
  [ -n "${KUBE_CONTEXT:-}" ] || die "set KUBE_CONTEXT to the $env cluster context"
  kc() { kubectl --context "$KUBE_CONTEXT" "$@"; }
fi

delete_app() {
  local app="$1"
  kc -n argocd get application "$app" >/dev/null 2>&1 || return 0
  log "deleting Application $app"
  kc -n argocd delete application "$app" --wait=true --timeout=10m
}

wait_until() {
  local what="$1" cmd="$2" deadline=$(( $(date +%s) + 900 ))
  until [ "$(eval "$cmd")" = "0" ]; do
    [ "$(date +%s)" -lt "$deadline" ] || die "timed out waiting for $what"
    sleep 10
  done
  log "$what: done"
}

# The root app would recreate the ApplicationSets, and they would recreate deleted Applications:
# remove both without touching what they generated.
kc -n argocd delete application root --cascade=orphan --ignore-not-found >/dev/null
for appset in $(kc -n argocd get applicationsets -o name 2>/dev/null); do
  kc -n argocd delete "$appset" --cascade=orphan >/dev/null
done

delete_app "cms-demo-$env"
delete_app "envoy-proxy-$env"
delete_app "envoy-gateway-$env"
wait_until "LoadBalancer Services gone" \
  "kc get svc -A -o json | python3 -I -c 'import json,sys; print(sum(1 for s in json.load(sys.stdin)[\"items\"] if s[\"spec\"][\"type\"] == \"LoadBalancer\"))'"

log "deleting PVCs in cms-demo (Argo CD never deletes them)"
kc -n cms-demo delete pvc --all --wait=true --timeout=5m || true

for app in external-dns coralogix-otel reloader external-secrets metrics-server storage aws-load-balancer-controller; do
  delete_app "$app-$env"
done

if kc -n argocd get application "argo-cd-$env" >/dev/null 2>&1; then
  kc -n argocd patch application "argo-cd-$env" --type json -p '[{"op":"remove","path":"/metadata/finalizers"}]' >/dev/null 2>&1 || true
  kc -n argocd delete application "argo-cd-$env" --cascade=orphan
fi
log "predestroy finished; now destroy the gitops stack, then infra"
