#!/usr/bin/env bash
# Destroys the local environment completely (fitness function F6).
. "$(dirname "$0")/lib.sh"

if aws_bootstrap sts get-caller-identity >/dev/null 2>&1 && [ -f "$AWS_DIR/credentials" ]; then
  for stack in gitops infra global; do
    "$(dirname "$0")/tf.sh" local "$stack" destroy -auto-approve -input=false || warn "destroy $stack failed; continuing"
  done
fi

docker compose -f "$COMPOSE_FILE" --profile app down -v --remove-orphans || true
leftover="$(docker ps -aq --filter label=io.floci=aws)"
[ -n "$leftover" ] && docker rm -f $leftover >/dev/null
vols="$(docker volume ls -q --filter label=io.floci=aws)"
[ -n "$vols" ] && docker volume rm $vols >/dev/null
rm -rf "$AWS_DIR" "$KUBECONFIG_LOCAL" "$LOCAL_DIR/.last-image-tag"
find "$TF_DIR/stacks" -maxdepth 2 -type d -name '.terraform-local' -exec rm -rf {} +
remaining="$(docker ps -a --filter label=io.floci=aws --format '{{.Names}}')"
[ -z "$remaining" ] && log "F6 no floci-spawned containers left" || warn "F6 leftover containers: $remaining"
