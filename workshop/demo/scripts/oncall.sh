#!/usr/bin/env bash
# Stand-in for KEDA (scope doc, section 2): on-call engineer Sam gets paged by the P1 alert and scales
# cms-backend 2 -> 8 through Git. He acts once the alert has been firing on two checks in a row (or the
# API probe has been slow twice), but not before ONCALL_MIN_WAIT; ONCALL_MAX_WAIT is the timer fallback.
#   ONCALL_ALERT         alert name filter for `cx alerts list` (default "CMS API p95 latency")
#   ONCALL_THRESHOLD_MS  median probe latency that counts as slow (default 1000)
#   ONCALL_MIN_WAIT      seconds after inject before Sam may act (default 150)
#   ONCALL_MAX_WAIT      timer fallback (default 420)
#   ONCALL_REPLICAS      target replicas (default 8)
. "$(dirname "$0")/lib.sh"

alert="${ONCALL_ALERT:-CMS API p95 latency}"
threshold="${ONCALL_THRESHOLD_MS:-1000}"
min_wait="${ONCALL_MIN_WAIT:-150}"
max_wait="${ONCALL_MAX_WAIT:-420}"
replicas="${ONCALL_REPLICAS:-8}"
injected_at="$(cat "$STATE_DIR/injected-at" 2>/dev/null || date +%s)"

# Read-only: the alert definition's status in Coralogix (profile from CX_PROFILE or the cx default).
alert_firing() {
  command -v cx >/dev/null 2>&1 || return 1
  cx alerts list --name "$alert" -o json 2>/dev/null | grep -q 'ALERT_DEF_STATUS_ALERTING'
}

slow=0
paged=0
reason=""
# A page still open from an earlier run says nothing about this one: ignore the alert until it has
# been seen resolved once.
stale=0
alert_firing && stale=1 && warn "the P1 alert is already firing from an earlier run; Sam ignores it until it resolves"
while :; do
  elapsed=$(( $(date +%s) - injected_at ))
  p50="$(probe_latency_ms 3)"
  if [ "$p50" -ge "$threshold" ]; then slow=$((slow + 1)); else slow=0; fi
  if alert_firing; then
    [ "$stale" = 1 ] || paged=$((paged + 1))
  else
    stale=0
    paged=0
  fi
  log "t+${elapsed}s alert firing streak $paged$([ "$stale" = 1 ] && echo ' (stale)'); probe median ${p50} ms (slow streak $slow)"
  if [ "$elapsed" -ge "$min_wait" ] && [ "$paged" -ge 2 ]; then
    reason="P1 alert firing on two checks in a row"
    break
  fi
  if [ "$elapsed" -ge "$min_wait" ] && [ "$slow" -ge 2 ]; then
    reason="probe median ${p50} ms, above ${threshold} ms twice in a row"
    break
  fi
  if [ "$elapsed" -ge "$max_wait" ]; then
    reason="timer fallback after ${elapsed}s"
    break
  fi
  sleep 30
done
log "scaling: $reason"

mirror_checkout
sed -i.bak -E "s/^  replicas: [0-9]+$/  replicas: $replicas/" "$MIRROR_DIR/$BACKEND_FILE"
rm -f "$MIRROR_DIR/$BACKEND_FILE.bak"
persona_commit "Sam Patel" "sam.patel@cms-demo.example" "ops: scale cms-backend 2 -> $replicas to absorb latency (INC-1103)

P1 \"CMS API p95 latency > 150 ms\" is firing and API latency is in
seconds. More API replicas to spread the load while we investigate." "$BACKEND_FILE"
mirror_push
argocd_refresh
log "on-call: cms-backend replicas 2 -> $replicas"
rm -f "$STATE_DIR/oncall.pid"
