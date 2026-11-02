#!/usr/bin/env bash
# Starts the socat edge: localhost:8080 -> Gateway listener "websecure" on the k3s node.
. "$(dirname "$0")/lib.sh"

target="$(k3s_container)"
EDGE_TARGET="$target" docker compose -f "$COMPOSE_FILE" --profile app up -d edge >/dev/null
log "edge: http://localhost:8080 -> $target:443"
log "Argo CD UI: KUBECONFIG=$KUBECONFIG_LOCAL kubectl -n argocd port-forward svc/argocd-server 8081:80"
log "Load generator UI: KUBECONFIG=$KUBECONFIG_LOCAL kubectl -n cms-demo port-forward svc/canvas-load 8090:8090"
