#!/usr/bin/env bash
# T+0 of INC-1: Dana's FinOps commit cuts the cms-postgres CPU limit, then the on-call watcher starts.
# Usage: inject.sh [cpu-limit]   (default 60m at 40 req/s; calibrated in the scope doc, section 5 W6)
#   NO_ONCALL=1  skip the automatic scale-out (rehearse the database beat alone)
. "$(dirname "$0")/lib.sh"

cpu="${1:-${INCIDENT_CPU:-60m}}"

mirror_checkout
git -C "$MIRROR_DIR" rev-parse -q --verify "refs/tags/$BASELINE_TAG" >/dev/null \
  || die "no $BASELINE_TAG tag in the mirror: run baseline.sh first"
if [ "$(git -C "$MIRROR_DIR" rev-parse HEAD)" != "$(git -C "$MIRROR_DIR" rev-parse "$BASELINE_TAG^{commit}")" ]; then
  if [ "$(git -C "$MIRROR_DIR" log -1 --format=%an)" = "cms-local" ]; then
    die "branch local is a newer working-tree snapshot (a 'make local-sync' ran): run baseline.sh to adopt it, then inject"
  fi
  die "the mirror is not at $BASELINE_TAG (an earlier run is still applied): run reset.sh first"
fi

# The commits must land on a running cluster: on 2026-11-03 a Docker Desktop restart had stopped
# floci, and Dana's and Sam's commits went to Git with nothing to apply them.
kubectl_local -n "$NAMESPACE" get statefulset cms-postgres >/dev/null 2>&1 \
  || die "cluster cms-local does not answer: run recover.sh first"
code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$API_URL/media/search?q=report&pageSize=20" || true)"
[ "$code" = "200" ] || die "API through localhost:8080 answers $code, not 200: run recover.sh first"

if command -v cx >/dev/null 2>&1 && cx alerts list --name "CMS API p95 latency" -o json 2>/dev/null | grep -q 'ALERT_DEF_STATUS_ALERTING'; then
  warn "the P1 alert is still firing from an earlier run: Slack will not get a fresh page. Wait for it to resolve (preflight step 3)."
fi

sed -i.bak -E "/limits:/,/volumeMounts:/ s/cpu: \"2\"/cpu: \"$cpu\"/" "$MIRROR_DIR/$PG_FILE"
rm -f "$MIRROR_DIR/$PG_FILE.bak"
grep -q "cpu: \"$cpu\"" "$MIRROR_DIR/$PG_FILE" || die "could not set the CPU limit in $PG_FILE"

persona_commit "Dana Okafor" "dana.okafor@cms-demo.example" "chore(db): right-size cms-postgres to observed usage (FIN-142)

30-day average CPU of cms-postgres is 0.04 cores against a 2-core limit
(FinOps report FIN-142). Lower the limit to $cpu to release reserved
capacity on the shared node pool. No functional change expected." "$PG_FILE"
mirror_push
argocd_refresh
date +%s > "$STATE_DIR/injected-at"
log "pushed: waiting for Argo CD to apply the new limit"
for _ in $(seq 1 18); do
  live="$(kubectl_local -n "$NAMESPACE" get statefulset cms-postgres -o jsonpath='{.spec.template.spec.containers[0].resources.limits.cpu}' 2>/dev/null || true)"
  [ "$live" = "$cpu" ] && break
  sleep 5
done
[ "$live" = "$cpu" ] || warn "cms-postgres still has limit ${live:-?} after 90 s; check Argo CD (kubectl -n argocd get applications)"
log "injected: cms-postgres CPU limit 2 -> $cpu"

if [ "${NO_ONCALL:-0}" != 1 ]; then
  nohup "$DEMO_DIR/scripts/oncall.sh" > "$STATE_DIR/oncall.log" 2>&1 &
  echo $! > "$STATE_DIR/oncall.pid"
  log "on-call watcher started (pid $!, log $STATE_DIR/oncall.log)"
fi
