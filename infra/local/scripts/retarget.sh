#!/usr/bin/env bash
# Points the local cluster's root app and every ApplicationSet at another source:
#   retarget.sh <pushed GitHub branch>   or   retarget.sh local   (the local Git mirror)
. "$(dirname "$0")/lib.sh"

target="${1:-}"
[ -n "$target" ] || die "usage: make local-retarget BRANCH=<pushed branch|local>"
if [ "$target" = "local" ]; then
  repo_url="http://172.30.0.11:3000/cms/cms_demo.git"
  "$(dirname "$0")/git-sync.sh"
else
  repo_url="https://github.com/RomaLoginovskiy/cms_demo.git"
  git -C "$ROOT" ls-remote --exit-code --heads origin "$target" >/dev/null 2>&1 || die "branch $target is not on GitHub"
fi

kubectl_local -n argocd annotate secret "cluster-$CLUSTER" \
  "gitops_repo_url=$repo_url" "gitops_revision=$target" --overwrite >/dev/null
kubectl_local -n argocd patch application root --type merge \
  -p "{\"spec\":{\"source\":{\"repoURL\":\"$repo_url\",\"targetRevision\":\"$target\"}}}" >/dev/null
log "local cluster now tracks $repo_url @ $target"
