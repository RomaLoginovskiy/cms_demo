#!/usr/bin/env bash
# Applies the gitops stack (Argo CD, cluster Secret, root app) and sets the local image tag override.
# Default source: the local Git mirror (working tree snapshot). GITOPS_SOURCE=github uses a pushed
# GitHub branch instead (GITOPS_REVISION, default: current branch).
. "$(dirname "$0")/lib.sh"

mirror_url="http://172.30.0.11:3000/cms/cms_demo.git"
github_url="https://github.com/RomaLoginovskiy/cms_demo.git"

if [ "${GITOPS_SOURCE:-local}" = "github" ]; then
  repo_url="$github_url"
  revision="${GITOPS_REVISION:-$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)}"
  git -C "$ROOT" ls-remote --exit-code --heads origin "$revision" >/dev/null 2>&1 || \
    die "branch '$revision' is not on GitHub; push it or use the local mirror (GITOPS_SOURCE=local)"
else
  "$(dirname "$0")/git-sync.sh"
  repo_url="$mirror_url"
  revision="local"
fi
log "Argo CD source: $repo_url @ $revision"

"$(dirname "$0")/kubeconfig.sh"
ensure_k3s
# Pods must resolve floci and its containers before ESO and the app start (gap G16).
kubectl_local apply -f "$LOCAL_DIR/k8s/coredns-custom.yaml" >/dev/null

"$(dirname "$0")/tf.sh" local gitops apply -auto-approve -input=false \
  -var "gitops_repo_url=$repo_url" -var "gitops_revision=$revision"

tag_file="$LOCAL_DIR/.last-image-tag"
if [ -f "$tag_file" ]; then
  tag="$(cat "$tag_file")"
  kubectl_local -n argocd annotate secret "cluster-$CLUSTER" "image_tag_override=$tag" --overwrite >/dev/null
  log "image_tag_override=$tag"
else
  warn "no images pushed yet (make local-images); pods will not start until a tag is set"
fi
