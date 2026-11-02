#!/usr/bin/env bash
# kubectl exec credential for the floci cluster. Always signs with the cms-local profile and never
# with AWS credentials the calling shell may export (env credentials would otherwise take precedence).
. "$(dirname "$0")/lib.sh"
use_identity
exec aws eks get-token --cluster-name "${1:-$CLUSTER}" --region "$REGION" --output json
