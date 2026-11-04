#!/usr/bin/env bash
# Brings cms-local back after a Docker Desktop restart, without a new GitOps snapshot (so the mirror
# stays at demo-baseline). What a restart breaks (seen 2026-11-03):
#   - floci has no restart policy, and does not restart its child containers (EKS k3s, MSK, registry);
#   - the first start of the k3s container fails on cgroups (gap G22); a second start works;
#   - the edge proxy comes back, but Docker Desktop's forward for localhost:8080 resets connections
#     until the container is restarted; k6 (through host.docker.internal:8080) stalls with it.
#   FLOCI_EKS_MAX_MEMORY_MIB  k3s memory cap (default 16896, set on 2026-11-03 for a 24 GiB Docker VM)
. "$(dirname "$0")/lib.sh"

mem="${FLOCI_EKS_MAX_MEMORY_MIB:-16896}"
FLOCI_EKS_MAX_MEMORY_MIB="$mem" make -C "$ROOT" local-up

k3s="$(k3s_container)"
for c in $(docker ps -a --filter label=io.floci.service --filter status=exited --format '{{.Names}}'); do
  [ "$c" = "$k3s" ] && continue
  docker start "$c" >/dev/null && log "started $c"
done
docker update --memory "${mem}m" --memory-swap "${mem}m" "$k3s" >/dev/null
( ensure_k3s ) || ensure_k3s

log "waiting for pods"
for _ in $(seq 1 60); do
  [ -z "$(kubectl_local get pods -A --no-headers 2>/dev/null | grep -v -E 'Running|Completed')" ] && break
  sleep 5
done

docker restart cms-local-edge >/dev/null && log "restarted the edge proxy (localhost:8080 forward)"
if docker ps -a --format '{{.Names}}' | grep -qx cms-incident-k6; then
  docker restart cms-incident-k6 >/dev/null && log "restarted k6"
fi
sleep 3
code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$API_URL/media/search?q=report&pageSize=20" || true)"
[ "$code" = "200" ] || die "API through localhost:8080 answers $code; check the edge and Argo CD"
log "cms-local is back: API 200 through localhost:8080; mirror untouched"
