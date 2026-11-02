#!/usr/bin/env bash
# Writes infra/local/.kubeconfig (gitignored) for the floci cluster. The exec credential is
# eks-token.sh, so `KUBECONFIG=infra/local/.kubeconfig kubectl ...` works from any shell and never
# signs with credentials exported in that shell.
. "$(dirname "$0")/lib.sh"
use_identity

endpoint="$(aws eks describe-cluster --endpoint-url "$FLOCI_URL" --name "$CLUSTER" --query 'cluster.endpoint' --output text)"
ca="$(aws eks describe-cluster --endpoint-url "$FLOCI_URL" --name "$CLUSTER" --query 'cluster.certificateAuthority.data' --output text)"
[ -n "$endpoint" ] && [ "$endpoint" != "None" ] || die "cluster $CLUSTER has no endpoint yet"

umask 077
cat > "$KUBECONFIG_LOCAL" <<KCFG
apiVersion: v1
kind: Config
clusters:
  - name: $CLUSTER
    cluster:
      server: $endpoint
      certificate-authority-data: $ca
users:
  - name: $CLUSTER
    user:
      exec:
        apiVersion: client.authentication.k8s.io/v1beta1
        command: $LOCAL_DIR/scripts/eks-token.sh
        args: ["$CLUSTER"]
        interactiveMode: Never
contexts:
  - name: $CLUSTER
    context:
      cluster: $CLUSTER
      user: $CLUSTER
current-context: $CLUSTER
KCFG
log "kubeconfig: export KUBECONFIG=$KUBECONFIG_LOCAL"
