#!/usr/bin/env bash
# Shared helpers for the incident demo scripts (spec/architecture/incident-demo-scope-2026-11-03.md).
# Persona commits go to branch "local" of the local Git mirror, which Argo CD on cms-local tracks.
# The presenter's own repository (index, HEAD, branches) is never touched.
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/infra/local/scripts/lib.sh"

DEMO_DIR="$ROOT/workshop/demo"
STATE_DIR="$LOCAL_DIR/.incident"
MIRROR_DIR="$STATE_DIR/mirror"
NAMESPACE="cms-demo"
BASELINE_TAG="demo-baseline"
PG_FILE="deploy/apps/cms-demo/components/incident-postgres/postgres.yaml"
BACKEND_FILE="deploy/apps/cms-demo/components/incident-postgres/cms-backend.yaml"
API_URL="${API_URL:-http://localhost:8080/api}"

mkdir -p "$STATE_DIR"

mirror_url() {
  local pw_file="$LOCAL_DIR/.git-mirror-password"
  [ -f "$pw_file" ] || die "no $pw_file: run 'make local-sync' first"
  printf 'http://cms:%s@127.0.0.1:3030/cms/cms_demo.git' "$(cat "$pw_file")"
}

# A private clone of the mirror, reset to the tip of branch "local".
mirror_checkout() {
  if [ ! -d "$MIRROR_DIR/.git" ]; then
    git clone --quiet --branch local "$(mirror_url)" "$MIRROR_DIR"
  fi
  git -C "$MIRROR_DIR" remote set-url origin "$(mirror_url)"
  git -C "$MIRROR_DIR" fetch --quiet --force --tags origin local
  git -C "$MIRROR_DIR" checkout --quiet -B local FETCH_HEAD
  git -C "$MIRROR_DIR" reset --quiet --hard FETCH_HEAD
}

# persona_commit "<name>" "<email>" "<message>" <file>...
persona_commit() {
  local name="$1" email="$2" message="$3"
  shift 3
  git -C "$MIRROR_DIR" add -- "$@"
  GIT_AUTHOR_NAME="$name" GIT_AUTHOR_EMAIL="$email" \
  GIT_COMMITTER_NAME="$name" GIT_COMMITTER_EMAIL="$email" \
    git -C "$MIRROR_DIR" commit --quiet -m "$message"
}

mirror_push() {
  git -C "$MIRROR_DIR" push --quiet origin HEAD:refs/heads/local
  log "mirror: local = $(git -C "$MIRROR_DIR" log -1 --format='%h %an: %s')"
  publish_gitops_history
  annotate_push
}

# Coralogix annotation at push time (ADR-025 sender, customEvent on demo-cms-api, environment local),
# with the pushed commit's own author, subject and SHA. Argo CD Notifications adds the Deployment
# marker once the sync settles; this one marks the push itself and does not depend on the sync.
# Never fails the caller: ops-event.sh only warns (missing or rejected key).
annotate_push() {
  local key domain sha
  key="$(sed -n 's/^CX_OPS_EVENTS_API_KEY=//p' "$LOCAL_DIR/.secrets.env" 2>/dev/null | tail -1 | tr -d "\"'")"
  domain="${CX_DOMAIN:-$(sed -n 's/^CX_DOMAIN=//p' "$LOCAL_DIR/.secrets.env" 2>/dev/null | tail -1 | tr -d "\"'")}"
  sha="$(git -C "$MIRROR_DIR" rev-parse HEAD)"
  CX_OPS_EVENTS_API_KEY="$key" CX_DOMAIN="${domain:-eu1.coralogix.com}" "$ROOT/infra/scripts/ops-event.sh" custom \
    --description "GitOps push to cms-local: $(git -C "$MIRROR_DIR" log -1 --format=%s)" \
    --service demo-cms-api --environment local \
    --extra category=gitops-push --extra origin=gitops-push \
    --extra commitAuthor="$(git -C "$MIRROR_DIR" log -1 --format=%an)" \
    --extra commitSubject="$(git -C "$MIRROR_DIR" log -1 --format=%s | cut -c1-200)" \
    --extra vcsRevision="$sha" --extra vcsRef=local --extra vcsDirty=false \
    --extra vcsRepository="http://127.0.0.1:3030/cms/cms_demo" \
    --extra commitUrl="http://127.0.0.1:3030/cms/cms_demo/commit/$sha" \
    --extra actor="$(git -C "$MIRROR_DIR" log -1 --format=%an)" || true
}

# The investigator reads Git history from a bare copy without the mirror's credentials.
GITOPS_GIT_DIR="$STATE_DIR/gitops.git"
publish_gitops_history() {
  [ -d "$GITOPS_GIT_DIR" ] || git init --quiet --bare "$GITOPS_GIT_DIR"
  git --git-dir="$GITOPS_GIT_DIR" fetch --quiet --force "$MIRROR_DIR" "+HEAD:refs/heads/local"
  git --git-dir="$GITOPS_GIT_DIR" symbolic-ref HEAD refs/heads/local
}

# Ask Argo CD to poll the mirror now instead of within its 3-minute interval. "hard" also drops the
# cached manifests: after a Docker restart (2026-11-03) Argo CD synced Sam's commit but kept
# reporting cms-postgres as Synced at 2 cores, so Dana's 60m never applied.
argocd_refresh() {
  local app
  for app in $(kubectl_local -n argocd get applications -o name 2>/dev/null | grep cms-demo); do
    kubectl_local -n argocd annotate "$app" argocd.argoproj.io/refresh=hard --overwrite >/dev/null
  done
}

# Prints the median latency in ms of n probes of the search endpoint (the same route k6 drives).
# Each probe gives up after PROBE_TIMEOUT seconds (default 10); a failed request counts as that,
# so errors read as "slow" too.
probe_latency_ms() {
  local n="${1:-5}" max="${PROBE_TIMEOUT:-10}" i out code secs samples=()
  for i in $(seq 1 "$n"); do
    out="$(curl -s -o /dev/null -m "$max" -w '%{http_code} %{time_total}' "$API_URL/media/search?q=report&pageSize=20" 2>/dev/null)" || true
    code="${out%% *}"
    secs="${out#* }"
    [ "$code" = "200" ] || secs="$max"
    samples+=("$secs")
  done
  printf '%s\n' "${samples[@]}" | sort -n | awk '{a[NR]=$1} END {printf "%d\n", a[int((NR+1)/2)] * 1000}'
}
