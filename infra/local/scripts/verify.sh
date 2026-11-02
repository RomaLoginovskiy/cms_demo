#!/usr/bin/env bash
# Fitness functions F1-F5 for the floci environment (spec/components/floci-local-environment.md).
# F6 (teardown) is `make local-nuke`. Exit code is non-zero when any check fails.
. "$(dirname "$0")/lib.sh"
use_identity

failed=0
pass() { log "PASS $*"; }
fail() { warn "FAIL $*"; failed=1; }
base="http://localhost:8080"

# F1: Terraform is idempotent against floci. A few floci responses differ from AWS in form only and
# leave a permanent diff; plan-quirks.py drops exactly those (gaps G18, G19) and lists the rest.
for stack in global infra gitops; do
  plan="$(mktemp "${TMPDIR:-/tmp}/verify-plan.XXXXXX")"
  plan_log="$plan.log"
  note=""
  set +e
  "$(dirname "$0")/tf.sh" local "$stack" plan -detailed-exitcode -input=false -lock=false -no-color \
    -out="$plan" >"$plan_log" 2>&1
  rc=$?
  set -e
  if [ "$rc" -eq 2 ]; then
    unexplained="$("$(dirname "$0")/tf.sh" local "$stack" show -json "$plan" 2>/dev/null | \
      python3 -I "$(dirname "$0")/plan-quirks.py")" || unexplained="(plan JSON unreadable)"
    if [ -z "$unexplained" ]; then rc=0; note=" (known floci diffs ignored)"; fi
  fi
  case "$rc" in
    0) pass "F1 $stack plan is empty$note" ;;
    2) fail "F1 $stack plan changes $(echo $unexplained) (make tf ENV=local STACK=$stack CMD=plan)" ;;
    *) fail "F1 $stack plan errored: $(grep -m1 -A2 'Error' "$plan_log" | tr -s ' \n' ' ' | cut -c1-300)" ;;
  esac
  rm -f "$plan" "$plan_log"
done

# F2: node Ready and every Argo CD Application Synced/Healthy (10 minutes).
if kubectl_local wait --for=condition=Ready nodes --all --timeout=120s >/dev/null 2>&1; then
  pass "F2 nodes Ready"
else
  fail "F2 nodes not Ready"
fi
deadline=$(( $(date +%s) + ${APPS_TIMEOUT_SECONDS:-600} ))
while :; do
  pending="$(kubectl_local -n argocd get applications -o json | python3 -I -c '
import json, sys
apps = json.load(sys.stdin)["items"]
bad = [a["metadata"]["name"] + "=" + a.get("status", {}).get("sync", {}).get("status", "?") + "/" + a.get("status", {}).get("health", {}).get("status", "?")
       for a in apps
       if a.get("status", {}).get("sync", {}).get("status") != "Synced" or a.get("status", {}).get("health", {}).get("status") != "Healthy"]
print(" ".join(bad) if apps else "no-applications")')"
  [ -z "$pending" ] && { pass "F2 all Applications Synced/Healthy"; break; }
  if [ "$(date +%s)" -ge "$deadline" ]; then fail "F2 not converged: $pending"; break; fi
  sleep 15
done

# F3: ExternalSecrets resolve; IRSA works end to end; with IAM enforcement the app role cannot read the ingest key.
not_ready="$(kubectl_local get externalsecrets -A -o json | python3 -I -c '
import json, sys
items = json.load(sys.stdin)["items"]
print(" ".join(i["metadata"]["namespace"] + "/" + i["metadata"]["name"] for i in items
               if not any(c.get("type") == "Ready" and c.get("status") == "True" for c in i.get("status", {}).get("conditions", []))))')"
[ -z "$not_ready" ] && pass "F3 ExternalSecrets Ready" || fail "F3 ExternalSecrets not Ready: $not_ready"
role_arn="$(aws ssm get-parameter --endpoint-url "$FLOCI_URL" --name "/$PROJECT/local/platform/irsa/eso_app" --query Parameter.Value --output text 2>/dev/null || true)"
token="$(kubectl_local -n external-secrets create token eso-app --audience sts.amazonaws.com 2>/dev/null || true)"
if [ -n "$role_arn" ] && [ -n "$token" ]; then
  creds="$(aws sts assume-role-with-web-identity --endpoint-url "$FLOCI_URL" --role-arn "$role_arn" \
    --role-session-name verify --web-identity-token "$token" \
    --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text 2>/dev/null || true)"
  if [ -n "$creds" ]; then
    pass "F3 IRSA: eso-app token assumes $role_arn"
    # Least privilege needs floci's IAM enforcement (gap G6); read the setting from the running container.
    enforced="$(docker inspect floci --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | \
      sed -n 's/^FLOCI_SERVICES_IAM_ENFORCEMENT_ENABLED=//p')"
    if [ "$enforced" = "true" ]; then
      set -- $creds
      # Unset, not empty: an empty AWS_PROFILE makes the CLI look for a profile named "".
      as_app() { env -u AWS_PROFILE AWS_ACCESS_KEY_ID="$1" AWS_SECRET_ACCESS_KEY="$2" AWS_SESSION_TOKEN="$3" \
        aws secretsmanager get-secret-value --endpoint-url "$FLOCI_URL" --secret-id "$4" --query Name --output text 2>&1; }
      out="$(as_app "$@" "$PROJECT/local/coralogix-rum" || true)"
      [ "$out" = "$PROJECT/local/coralogix-rum" ] && pass "F3 eso-app reads its own secret" || fail "F3 eso-app cannot read its own secret: $out"
      for denied in "$PROJECT/local/coralogix-ingest" "$PROJECT/dev/coralogix-rum"; do
        out="$(as_app "$@" "$denied" || true)"
        case "$out" in
          *AccessDenied*) pass "F3 eso-app denied $denied" ;;
          *) fail "F3 eso-app not denied $denied: $(echo "$out" | head -c 160)" ;;
        esac
      done
    else
      log "SKIP F3 least-privilege checks: floci IAM enforcement is off (FLOCI_IAM_ENFORCEMENT=true make local-up)"
    fi
  else
    fail "F3 IRSA: AssumeRoleWithWebIdentity failed for eso-app"
  fi
else
  fail "F3 IRSA prerequisites missing (role parameter or service account token)"
fi

# F4: edge routing.
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
[ "$(code "$base/cms/")" = "200" ] && pass "F4 /cms" || fail "F4 /cms"
[ "$(code "$base/api/media")" = "200" ] && pass "F4 /api/media" || fail "F4 /api/media"
[ "$(code "$base/")" = "200" ] && pass "F4 /" || fail "F4 /"
[ "$(code -X POST "$base/hubs/board/negotiate?negotiateVersion=1")" = "200" ] && pass "F4 SignalR negotiate" || fail "F4 SignalR negotiate"
ws="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" "$base/hubs/board" || true)"
case "$ws" in 101|400) pass "F4 WebSocket upgrade reaches canvas-backend ($ws)" ;; *) fail "F4 WebSocket upgrade ($ws)" ;; esac
traces="$(code -X POST -H 'Content-Type: application/json' -d '{}' "$base/v1/traces")"
[ "$traces" != "404" ] && [ "$traces" != "000" ] && pass "F4 /v1/traces reaches the collector ($traces)" || fail "F4 /v1/traces ($traces)"
# Upload size: the API caps files at 5 MiB (MediaController, 400 above it); the edge must pass bodies up
# to that size untouched. The API checks only the declared content type, so zero bytes stand in for a PNG.
blob="$(mktemp "${TMPDIR:-/tmp}/verify-blob.XXXXXX")"
head -c $((5 * 1024 * 1024 - 64 * 1024)) /dev/zero > "$blob"
resp="$(curl -s -w '\n%{http_code}' -F "files=@$blob;type=image/png;filename=verify-limit.png" \
  -F title=verify-limit -F tags=verify "$base/api/media" || true)"
if [ "${resp##*$'\n'}" = "201" ]; then
  pass "F4 upload just under 5 MiB accepted"
  big_id="$(python3 -I -c 'import json,sys; d=json.loads(sys.argv[1]); print(d.get("id") or d.get("Id") or "")' \
    "${resp%$'\n'*}" 2>/dev/null || true)"
  [ -z "$big_id" ] || curl -s -o /dev/null -X DELETE "$base/api/media/$big_id" || true
else
  fail "F4 upload just under 5 MiB (${resp##*$'\n'})"
fi
head -c $((6 * 1024 * 1024)) /dev/zero > "$blob"
over="$(code -F "files=@$blob;type=image/png;filename=verify-limit.png" "$base/api/media")"
[ "$over" = "400" ] && pass "F4 upload over 5 MiB rejected by the API (400)" || fail "F4 upload over 5 MiB ($over)"
rm -f "$blob"

# F5: upload -> media.uploaded -> media-worker consumes it. The worker handles one message at a time
# and, with the placeholder captioning endpoint (Q5), spends seconds per message in client retries,
# so under the load generator it may not reach the new upload within the wait. The check proves the
# wiring (message on the topic, worker consuming) and names the upload once the worker reaches it.
# Output is captured before matching: under pipefail, `producer | grep -q` fails when grep exits
# early (SIGPIPE), and `timeout ... rpk topic consume` always exits 124.
worker_log() { kubectl_local -n cms-demo logs deploy/media-worker --since="$1" 2>/dev/null || true; }
png="$(mktemp "${TMPDIR:-/tmp}/verify.XXXXXX")"
python3 -I -c 'import base64,sys; sys.stdout.buffer.write(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="))' > "$png"
id="$(curl -s -F "files=@$png;type=image/png;filename=verify.png" -F title=verify -F tags=verify "$base/api/media" | \
  python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id") or d.get("Id") or "")' 2>/dev/null || true)"
rm -f "$png"
if [ -n "$id" ]; then
  pass "F5 upload accepted ($id)"
  keys="$(docker exec "$(msk_container)" timeout 10 rpk topic consume media.uploaded -o start -f '%k\n' 2>/dev/null || true)"
  if grep -qxF "$id" <<<"$keys"; then
    pass "F5 media.uploaded carries $id"
  else
    fail "F5 $id not found on media.uploaded"
  fi
  found=""
  for _ in $(seq 1 12); do
    if grep -qF "$id" <<<"$(worker_log 10m)"; then found=1; break; fi
    sleep 5
  done
  if [ -n "$found" ]; then
    pass "F5 media-worker consumed $id"
  elif grep -qF 'Received media event' <<<"$(worker_log 2m)"; then
    pass "F5 media-worker is consuming media.uploaded ($id still queued behind earlier uploads)"
  else
    fail "F5 media-worker is not consuming media.uploaded"
  fi
else
  fail "F5 upload failed"
fi

[ "$failed" -eq 0 ] && log "all checks passed" || die "some checks failed"
