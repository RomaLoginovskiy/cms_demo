#!/usr/bin/env bash
# Pushes a snapshot of the working tree (tracked + untracked, honouring .gitignore) to branch
# "local" of the local Git mirror. Your index, HEAD and branches are not touched.
. "$(dirname "$0")/lib.sh"

container="cms-local-git"
host_url="http://127.0.0.1:3030"
pw_file="$LOCAL_DIR/.git-mirror-password"

docker compose -f "$COMPOSE_FILE" up -d git >/dev/null
for _ in $(seq 1 60); do
  curl -fsS "$host_url/api/healthz" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS "$host_url/api/healthz" >/dev/null 2>&1 || die "local Git mirror did not start (docker logs $container)"

if [ ! -f "$pw_file" ]; then
  (umask 077; python3 -I -c 'import secrets; print(secrets.token_urlsafe(24), end="")' > "$pw_file")
fi
pw="$(cat "$pw_file")"
# The mirror's volumes and the password file can get out of step (a fresh volume after
# `make local-nuke`, or a deleted file), so the user is ensured on every run.
docker exec -u git "$container" gitea admin user create --admin --username cms --password "$pw" \
  --email cms@local.test --must-change-password=false >/dev/null 2>&1 || \
docker exec -u git "$container" gitea admin user change-password --username cms --password "$pw" \
  --must-change-password=false >/dev/null

index="$(mktemp "${TMPDIR:-/tmp}/cms-index.XXXXXX")"
trap 'rm -f "$index"' EXIT
export GIT_AUTHOR_NAME="cms-local" GIT_AUTHOR_EMAIL="cms-local@local.test"
export GIT_COMMITTER_NAME="cms-local" GIT_COMMITTER_EMAIL="cms-local@local.test"
GIT_INDEX_FILE="$index" git -C "$ROOT" read-tree HEAD
GIT_INDEX_FILE="$index" git -C "$ROOT" add -A
tree="$(GIT_INDEX_FILE="$index" git -C "$ROOT" write-tree)"
# Parentless on purpose: a shallow clone (CI checkout) cannot push history it does not have
# ("shallow update not allowed"), and Argo CD only needs the tree.
commit="$(git -C "$ROOT" commit-tree "$tree" \
  -m "local snapshot of $(git -C "$ROOT" rev-parse --short=12 HEAD) + working tree, $(date -u +%Y-%m-%dT%H:%M:%SZ)")"

git -C "$ROOT" push --force --quiet "http://cms:${pw}@127.0.0.1:3030/cms/cms_demo.git" "$commit:refs/heads/local"
log "local mirror: branch local = ${commit:0:12} (working tree snapshot)"

# Ask Argo CD to look now instead of on its next poll (no-op before bootstrap). A sync that is
# retrying stays pinned to the revision it started with, so it is terminated first; auto-sync then
# starts over from the new snapshot.
if [ -f "$KUBECONFIG_LOCAL" ]; then
  retrying="$(kubectl_local -n argocd get applications -o jsonpath='{range .items[?(@.status.operationState.phase=="Running")]}{.metadata.name} {.status.operationState.retryCount}{"\n"}{end}' 2>/dev/null || true)"
  while read -r name retries; do
    [ -n "$name" ] && [ "${retries:-0}" -gt 0 ] || continue
    kubectl_local -n argocd patch application "$name" --type merge \
      -p '{"status":{"operationState":{"phase":"Terminating"}}}' >/dev/null 2>&1 || true
    log "terminated retrying sync of $name"
  done <<<"$retrying"
  for app in $(kubectl_local -n argocd get applications -o name 2>/dev/null); do
    kubectl_local -n argocd annotate "$app" argocd.argoproj.io/refresh=normal --overwrite >/dev/null 2>&1 || true
  done
fi
