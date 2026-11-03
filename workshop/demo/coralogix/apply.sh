#!/usr/bin/env bash
# Creates the Coralogix objects of the cms-demo incident demo
# (spec/architecture/incident-demo-scope-2026-11-03.md):
#   1. Slack connector "slack-production-alerts" (#production-alerts), reusing the Slack integration
#      of an existing connector
#   2. Dashboard "cms-demo · API health (cms-local)"
#   2b. Router "cms-platform": routing label team=cms-platform; a Cases rule sends the team's Cases to
#      the connector (Slack Cases preset)
#   3. P1 alert "[cms-local] CMS API p95 latency > 150 ms": owning team cms-platform (entity labels
#      "team" and "routing.team"), dashboard link in its description; its Case is routed by label
#   3b. P1 alert "[cms-local] cms-postgres FATAL errors > 10 in 5 min": PostgreSQL FATAL logs of
#      cms-demo/cms-postgres, same team labels and routing as the p95 alert
# Objects that already exist (matched by name) are reused and never modified, except the dashboard
# with UPDATE_DASHBOARD=1.
#
# Usage:  bash workshop/demo/coralogix/apply.sh
# Env:    CX_PROFILE_NAME   cx profile (default: "default", the watcher team on eu1)
#         SOURCE_CONNECTOR  existing Slack connector whose integration is reused (default: slack-roman-internal)
#         DRY_RUN=1         render and print the payloads, create nothing
#         UPDATE_DASHBOARD=1 replace the existing dashboard (same id) with dashboard-cms-api.json
set -euo pipefail

profile="${CX_PROFILE_NAME:-default}"
source_connector="${SOURCE_CONNECTOR:-slack-roman-internal}"
dry_run="${DRY_RUN:-0}"
verb="created"; [[ "$dry_run" == "1" ]] && verb="would create"
here="$(cd "$(dirname "$0")" && pwd)"
connector_file="$here/connector-slack-production-alerts.json"
dashboard_file="$here/dashboard-cms-api.json"
alert_file="$here/alert-cms-api-p95.json"
postgres_alert_file="$here/alert-cms-postgres-fatal.json"

# cx prints progress and update banners around its JSON; this keeps the first JSON document.
first_json='
import json, re, sys
s = sys.stdin.read()
m = re.search(r"(?m)^(\{|\[\s*$|\[\s*[\{\"\]])", s)
if not m:
    sys.exit("no JSON in cx output:\n" + s)
print(json.dumps(json.JSONDecoder().raw_decode(s[m.start():])[0]))'

cx_raw() { cx -p "$profile" "$@" -o json 2>&1; }

cx_json() {
  local out
  if ! out="$(cx_raw "$@")"; then
    printf 'cx %s failed:\n%s\n' "$*" "$out" >&2
    return 1
  fi
  printf '%s' "$out" | python3 -c "$first_json"
}

# id of the object named $1 in a JSON list on stdin (empty if none)
id_by_name() {
  python3 -c 'import json, sys
name = sys.argv[1]
print(next((x.get("id", "") for x in json.load(sys.stdin) if x.get("name") == name), ""))' "$1"
}

# first id-like value in cx output on stdin
created_id() {
  python3 -c "$first_json" | python3 -c 'import json, sys
def find(o):
    if isinstance(o, dict):
        for k in ("id", "alertDefId", "dashboardId"):
            v = o.get(k)
            if isinstance(v, str) and v:
                return v
            if isinstance(v, dict) and isinstance(v.get("value"), str):
                return v["value"]
        for v in o.values():
            r = find(v)
            if r:
                return r
    if isinstance(o, list):
        for v in o:
            r = find(v)
            if r:
                return r
    return ""
print(find(json.load(sys.stdin)))'
}

name_of() {
  python3 -c 'import json, sys
d = json.load(open(sys.argv[1]))
print(d.get("connector", d.get("alertDefProperties", d))["name"])' "$1"
}

# render <template> KEY=value...: fill ${KEY} placeholders and validate the JSON
render() {
  python3 - "$@" <<'PY'
import json, sys
text = open(sys.argv[1]).read()
for pair in sys.argv[2:]:
    key, value = pair.split("=", 1)
    text = text.replace("${" + key + "}", value)
if "${" in text:
    sys.exit("unfilled placeholder in " + sys.argv[1])
print(json.dumps(json.loads(text), indent=2, ensure_ascii=False))
PY
}

create() { # create <cx args...> with the payload on stdin; prints raw cx output
  if [[ "$dry_run" == "1" ]]; then
    echo "--- DRY RUN: cx $* --from-file - --yes" >&2
    cat >&2
    return 0
  fi
  local out
  if ! out="$(cx -p "$profile" "$@" --from-file - --yes -o json 2>&1)"; then
    printf 'cx %s failed:\n%s\n' "$*" "$out" >&2
    return 1
  fi
  printf '%s' "$out"
}

console="$(cx_raw --read-only notifications connectors list | grep -o 'https://[^/ ]*' | head -1)"
[[ -n "$console" ]] || { echo "could not reach Coralogix with profile '$profile'" >&2; exit 1; }
echo "profile '$profile' → $console"

echo "== 1/3 Slack connector"
connector_name="$(name_of "$connector_file")"
connectors="$(cx_json --read-only notifications connectors list)"
connector_id="$(printf '%s' "$connectors" | id_by_name "$connector_name")"
if [[ -n "$connector_id" ]]; then
  echo "reusing $connector_name ($connector_id)"
else
  source_id="$(printf '%s' "$connectors" | id_by_name "$source_connector")"
  [[ -n "$source_id" ]] || { echo "Slack connector '$source_connector' not found; set SOURCE_CONNECTOR" >&2; exit 1; }
  fields="$(cx_json --read-only notifications connectors get "$source_id" | python3 -c 'import json, sys
f = {x["fieldName"]: x.get("value", "") for x in json.load(sys.stdin)["connector"]["connectorConfig"]["fields"]}
print(f["integrationId"], f.get("channel", ""))')"
  read -r integration_id fallback_channel <<<"$fields"
  out="$(render "$connector_file" "INTEGRATION_ID=$integration_id" "FALLBACK_CHANNEL=$fallback_channel" \
    | create notifications connectors create)"
  connector_id="$([[ "$dry_run" == "1" ]] && echo "<new-connector-id>" || printf '%s' "$out" | created_id)"
  echo "$verb $connector_name ($connector_id)"
fi

echo "== 2b Router (label routing)"
router_file="$here/router-cms-platform.json"
router_name="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["router"]["name"])' "$router_file")"
router_id="$(cx_json --read-only notifications routers list | id_by_name "$router_name")"
if [[ -n "$router_id" ]]; then
  echo "reusing router $router_name ($router_id)"
else
  out="$(render "$router_file" "CONNECTOR_ID=$connector_id" | create notifications routers create)"
  router_id="$([[ "$dry_run" == "1" ]] && echo "<new-router-id>" || printf '%s' "$out" | created_id)"
  echo "$verb router $router_name ($router_id)"
fi

echo "== 2/3 Dashboard"
dashboard_name="$(name_of "$dashboard_file")"
dashboard_id="$(cx_json --read-only dashboards catalog | id_by_name "$dashboard_name")"
if [[ -n "$dashboard_id" && "${UPDATE_DASHBOARD:-0}" == "1" ]]; then
  # Replace in place: same id and URL, so the alert's dashboard link stays valid.
  python3 -c 'import json, sys
d = json.load(open(sys.argv[1])); d["id"] = sys.argv[2]; print(json.dumps(d))' "$dashboard_file" "$dashboard_id" \
    | create dashboards replace >/dev/null
  echo "$([[ "$dry_run" == "1" ]] && echo "would replace" || echo "replaced") '$dashboard_name' ($dashboard_id)"
elif [[ -n "$dashboard_id" ]]; then
  echo "reusing '$dashboard_name' ($dashboard_id); UPDATE_DASHBOARD=1 replaces it with $dashboard_file"
else
  out="$(create dashboards create < "$dashboard_file")"
  if [[ "$dry_run" == "1" ]]; then
    dashboard_id="<new-dashboard-id>"
  else
    dashboard_id="$(grep -o 'dashboards/[A-Za-z0-9]*' <<<"$out" | head -1 | cut -d/ -f2)"
    [[ -n "$dashboard_id" ]] || dashboard_id="$(printf '%s' "$out" | created_id)"
  fi
  echo "$verb '$dashboard_name' ($dashboard_id)"
fi
dashboard_url="$console/dashboards/$dashboard_id"

echo "== 3/3 Alerts"
# apply_alert <file>: creates the alert defined in <file> unless one with its name exists; sets alert_id
apply_alert() {
  local file="$1" name out
  name="$(name_of "$file")"
  alert_id="$(cx_json --read-only alerts list --name "$name" | id_by_name "$name")"
  if [[ -n "$alert_id" ]]; then
    echo "reusing '$name' ($alert_id); edit it in the UI to change it"
  else
    out="$(render "$file" "CONNECTOR_ID=$connector_id" "DASHBOARD_URL=$dashboard_url" \
      | create alerts create)"
    alert_id="$([[ "$dry_run" == "1" ]] && echo "<new-alert-id>" || printf '%s' "$out" | created_id)"
    echo "$verb '$name' ($alert_id)"
  fi
}
apply_alert "$alert_file"; p95_alert_id="$alert_id"
apply_alert "$postgres_alert_file"; postgres_alert_id="$alert_id"

[[ "$dry_run" == "1" ]] && { echo "dry run: nothing created"; exit 0; }

echo "== Verify"
for id in "$p95_alert_id" "$postgres_alert_id"; do
  cx_json --read-only alerts get "$id" | python3 -c 'import json, sys
a = json.load(sys.stdin)
p = a.get("alertDef", a).get("alertDefProperties", {})
labels = p.get("entityLabels", {})
print("name:       ", p.get("name"))
print("priority:   ", p.get("priority"))
print("team label: ", labels.get("team"), "| routing.team:", labels.get("routing.team"))
print("description:", p.get("description"))'
  echo "alert:     $console/alerts/$id"
done
echo "dashboard: $dashboard_url"
