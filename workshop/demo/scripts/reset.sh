#!/usr/bin/env bash
# Returns the scenario to its baseline: mirror branch "local" back at demo-baseline, Argo CD synced,
# cms-postgres and cms-backend ready. History of the run stays in Argo CD and Coralogix.
. "$(dirname "$0")/lib.sh"

if [ -f "$STATE_DIR/oncall.pid" ]; then
  kill "$(cat "$STATE_DIR/oncall.pid")" 2>/dev/null || true
  rm -f "$STATE_DIR/oncall.pid"
fi
rm -f "$STATE_DIR/injected-at"

mirror_checkout
git -C "$MIRROR_DIR" rev-parse -q --verify "refs/tags/$BASELINE_TAG" >/dev/null || die "no $BASELINE_TAG tag"
# `make local-sync` (any session) replaces branch local with a working-tree snapshot by "cms-local".
# Resetting would roll that deployment back, so adopt it as the new baseline instead.
if git -C "$MIRROR_DIR" log --format=%an "$BASELINE_TAG..HEAD" | grep -qx "cms-local"; then
  die "branch local holds a newer working-tree snapshot than $BASELINE_TAG (a 'make local-sync' ran); resetting would undo it. Run baseline.sh to adopt it as the baseline."
fi
git -C "$MIRROR_DIR" push --quiet --force origin "refs/tags/$BASELINE_TAG^{commit}:refs/heads/local"
log "mirror: local reset to $BASELINE_TAG"
mirror_checkout
publish_gitops_history
argocd_refresh

log "waiting for cms-postgres and cms-backend"
for _ in $(seq 1 60); do
  limit="$(kubectl_local -n "$NAMESPACE" get statefulset cms-postgres -o jsonpath='{.spec.template.spec.containers[0].resources.limits.cpu}' 2>/dev/null || true)"
  want="$(kubectl_local -n "$NAMESPACE" get deploy cms-backend -o jsonpath='{.spec.replicas}' 2>/dev/null || true)"
  [ "$limit" = "2" ] && [ "$want" = "2" ] && break
  sleep 5
done
kubectl_local -n "$NAMESPACE" rollout status statefulset/cms-postgres --timeout=180s
kubectl_local -n "$NAMESPACE" rollout status deploy/cms-backend --timeout=180s
log "baseline restored; wait ~5 min for p95 and the alert to settle before the next run"
