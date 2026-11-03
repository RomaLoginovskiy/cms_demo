#!/usr/bin/env bash
# One status line every INTERVAL seconds (default 15): Postgres limit and CPU, cms-backend replicas,
# database connections and the API probe. A presenter pane, and the calibration tool (scope doc W6).
# Usage: watch.sh [iterations]   (default: until Ctrl-C)
. "$(dirname "$0")/lib.sh"

n="${1:-0}"
interval="${INTERVAL:-15}"
i=0
while [ "$n" -eq 0 ] || [ "$i" -lt "$n" ]; do
  i=$((i + 1))
  limit="$(kubectl_local -n "$NAMESPACE" get pod cms-postgres-0 -o jsonpath='{.spec.containers[0].resources.limits.cpu}' 2>/dev/null || echo '?')"
  cpu="$(kubectl_local -n "$NAMESPACE" top pod cms-postgres-0 --no-headers 2>/dev/null | awk '{print $2}' || true)"
  ready="$(kubectl_local -n "$NAMESPACE" get deploy cms-backend -o jsonpath='{.status.readyReplicas}/{.spec.replicas}' 2>/dev/null || true)"
  conns="$(kubectl_local -n "$NAMESPACE" exec cms-postgres-0 -c postgres -- \
    psql -U cms -d cms -tAc "select count(*) from pg_stat_activity where datname='cms'" 2>/dev/null || echo '?')"
  probe="$(probe_latency_ms 3)"
  printf '%s pg limit=%-5s cpu=%-5s conns=%-3s backend=%-5s probe=%sms\n' \
    "$(date +%H:%M:%S)" "$limit" "${cpu:-?}" "$conns" "$ready" "$probe"
  sleep "$interval"
done
