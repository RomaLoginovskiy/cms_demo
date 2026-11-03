#!/usr/bin/env bash
# Prepares the Claude Code investigator's read-only access (scope doc W8):
#   - ServiceAccount demo-viewer (view + Argo CD Applications) and a kubeconfig with its token;
#   - a credential-free bare copy of the GitOps history (the mirror's branch "local");
#   - workshop/demo/investigator/.claude/settings.local.json pointing at both.
# Then: cd workshop/demo/investigator && claude   (paste prompt.md)
. "$(dirname "$0")/lib.sh"

kubeconfig="$STATE_DIR/investigator.kubeconfig"
settings="$DEMO_DIR/investigator/.claude/settings.local.json"

kubectl_local apply -f "$DEMO_DIR/investigator/rbac.yaml" >/dev/null
token="$(kubectl_local -n default create token demo-viewer --duration=48h)"
server="$(kubectl_local config view --raw --minify -o jsonpath='{.clusters[0].cluster.server}')"
ca="$(kubectl_local config view --raw --minify -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')"

(umask 077; cat > "$kubeconfig" <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: cms-local
    cluster:
      server: $server
      certificate-authority-data: $ca
users:
  - name: demo-viewer
    user:
      token: $token
contexts:
  - name: cms-local
    context:
      cluster: cms-local
      user: demo-viewer
current-context: cms-local
EOF
)

mirror_checkout
publish_gitops_history

mkdir -p "$(dirname "$settings")"
cat > "$settings" <<EOF
{
  "env": {
    "KUBECONFIG": "$kubeconfig",
    "GITOPS_GIT_DIR": "$GITOPS_GIT_DIR"
  }
}
EOF

KUBECONFIG="$kubeconfig" kubectl auth can-i list pods -n cms-demo >/dev/null || die "demo-viewer cannot list pods"
KUBECONFIG="$kubeconfig" kubectl get applications -n argocd >/dev/null || die "demo-viewer cannot read Argo CD applications"
if KUBECONFIG="$kubeconfig" kubectl auth can-i patch deployments -n cms-demo >/dev/null 2>&1; then
  die "demo-viewer can patch deployments: not read-only"
fi
log "investigator ready: kubeconfig $kubeconfig (token valid 48 h), history $GITOPS_GIT_DIR"
log "start it with: cd $DEMO_DIR/investigator && claude"
