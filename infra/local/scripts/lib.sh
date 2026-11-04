#!/usr/bin/env bash
# Shared helpers for the floci local environment. Bash 3.2 compatible (macOS default).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LOCAL_DIR="$ROOT/infra/local"
TF_DIR="$ROOT/infra/terraform"
COMPOSE_FILE="$LOCAL_DIR/docker-compose.yml"

FLOCI_URL="${FLOCI_URL:-http://localhost:4566}"
REGION="${AWS_REGION:-eu-west-1}"
ACCOUNT_ID="000000000000"
CLUSTER="${CLUSTER:-cms-local}"
PROJECT="cms-demo"

# A dedicated AWS CLI profile keeps emulator credentials away from ~/.aws.
AWS_DIR="$LOCAL_DIR/.aws"
KUBECONFIG_LOCAL="$LOCAL_DIR/.kubeconfig"

export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION" AWS_PAGER="" CHECKPOINT_DISABLE=1
# Reuse downloaded providers across environments and stacks.
export TF_PLUGIN_CACHE_DIR="${TF_PLUGIN_CACHE_DIR:-$HOME/.terraform.d/plugin-cache}"
mkdir -p "$TF_PLUGIN_CACHE_DIR"

log()  { printf '\033[1;34m[local]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m[local]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[local]\033[0m %s\n' "$*" >&2; exit 1; }

# Calls with the public bootstrap pair (only for creating the real local identity).
aws_bootstrap() {
  (
    unset AWS_PROFILE AWS_SESSION_TOKEN
    export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
    export AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null
    aws --endpoint-url "$FLOCI_URL" "$@"
  )
}

# Uses the local-admin profile written by identity.sh (EKS token auth refuses test/test).
use_identity() {
  [ -f "$AWS_DIR/credentials" ] || die "no local identity; run: make local-identity"
  export AWS_CONFIG_FILE="$AWS_DIR/config" AWS_SHARED_CREDENTIALS_FILE="$AWS_DIR/credentials"
  export AWS_PROFILE="cms-local" AWS_ENDPOINT_URL="$FLOCI_URL"
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
}

aws_local() { use_identity; aws --endpoint-url "$FLOCI_URL" "$@"; }

kubectl_local() { KUBECONFIG="$KUBECONFIG_LOCAL" kubectl --context "$CLUSTER" "$@"; }

# floci names spawned containers floci-aws-<service>-<id> (older builds: floci-<service>-<id>);
# resolve by label first and never hard-code names.
k3s_container() {
  local name
  name="$(docker ps -a --filter "label=io.floci.resource-id=$CLUSTER" --format '{{.Names}}' | head -n1)"
  if [ -z "$name" ]; then
    for candidate in "floci-aws-eks-$CLUSTER" "floci-eks-$CLUSTER"; do
      if docker inspect "$candidate" >/dev/null 2>&1; then name="$candidate"; break; fi
    done
  fi
  [ -n "$name" ] || die "k3s container for $CLUSTER not found (is the infra stack applied?)"
  printf '%s\n' "$name"
}

# floci restarts the k3s container once after creating it, and that restart can die in kubelet
# ("cgroup [kubepods] has some missing controllers"); a plain start then works (gap G22).
# Starts a stopped k3s container and waits for the Kubernetes API (needs the kubeconfig).
ensure_k3s() {
  local name
  name="$(k3s_container)"
  if [ "$(docker inspect -f '{{.State.Running}}' "$name")" != "true" ]; then
    warn "k3s container $name is stopped; starting it (gap G22)"
    docker start "$name" >/dev/null
  fi
  for _ in $(seq 1 60); do
    kubectl_local get --raw /readyz >/dev/null 2>&1 && return 0
    sleep 5
  done
  die "Kubernetes API of $CLUSTER is not ready (docker logs $name)"
}

# Redpanda broker that floci runs for the MSK cluster (one per environment).
msk_container() {
  local name
  name="$(docker ps --filter label=io.floci.service=msk --filter "label=io.floci.region=$REGION" \
    --format '{{.Names}}' | head -n1)"
  [ -n "$name" ] || die "MSK container not found (is the infra stack applied?)"
  printf '%s\n' "$name"
}

host_platform() {
  case "$(docker info --format '{{.Architecture}}' 2>/dev/null)" in
    aarch64|arm64) echo "linux/arm64" ;;
    x86_64|amd64) echo "linux/amd64" ;;
    *) echo "linux/arm64" ;;
  esac
}
