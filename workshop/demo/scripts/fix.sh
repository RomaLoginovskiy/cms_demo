#!/usr/bin/env bash
# The fix Olly and Claude Code should propose: revert the FinOps cut and the scale-out in one commit.
# Usage: fix.sh   (FIX_AUTHOR_NAME / FIX_AUTHOR_EMAIL override the author; default: your git identity)
. "$(dirname "$0")/lib.sh"

name="${FIX_AUTHOR_NAME:-$(git -C "$ROOT" config user.name || echo presenter)}"
email="${FIX_AUTHOR_EMAIL:-$(git -C "$ROOT" config user.email || echo presenter@cms-demo.example)}"

if [ -f "$STATE_DIR/oncall.pid" ]; then
  kill "$(cat "$STATE_DIR/oncall.pid")" 2>/dev/null || true
  rm -f "$STATE_DIR/oncall.pid"
  log "stopped the on-call watcher before it scaled"
fi

mirror_checkout
commits="$(git -C "$MIRROR_DIR" log --format=%H --grep='FIN-142' --grep='INC-1103' "$BASELINE_TAG..HEAD")"
[ -n "$commits" ] || die "nothing to revert since $BASELINE_TAG"

# shellcheck disable=SC2086  # one hash per word, newest first
git -C "$MIRROR_DIR" revert --no-commit $commits
GIT_AUTHOR_NAME="$name" GIT_AUTHOR_EMAIL="$email" \
GIT_COMMITTER_NAME="$name" GIT_COMMITTER_EMAIL="$email" \
  git -C "$MIRROR_DIR" commit --quiet -m "revert: restore cms-postgres CPU and cms-backend replicas (INC-1103)

cms-postgres was CPU-throttled at its new limit (FIN-142), so queries
queued and API p95 went from ~50 ms to seconds. Scaling cms-backend
added 20-connection pools per pod against max_connections=50 and turned
latency into 'too many clients' errors. Restore the 2-core limit and
2 replicas; right-sizing needs peak, not average, CPU."
mirror_push
argocd_refresh
log "fix pushed; recovery shows in about 3-5 min"
