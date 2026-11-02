#!/usr/bin/env bash
# Destroys the local environment completely (fitness function F6).
. "$(dirname "$0")/lib.sh"

# floci labels what it creates inconsistently (G24): spawned containers carry io.floci.* labels,
# MSK and ECR volumes floci_emulator=floci-aws and the EKS volume none, but every name starts
# with floci-aws-. Each lookup is the union of those, plus what compose created for cms-local;
# $1 is the docker --format template.
floci_containers() {
  for f in label=io.floci=aws label=io.floci.service name=floci-aws- label=com.docker.compose.project=cms-local; do
    docker ps -a --filter "$f" --format "$1"
  done | sort -u
}
floci_volumes() {
  for f in label=io.floci=aws label=floci_emulator=floci-aws name=floci-aws- label=com.docker.compose.project=cms-local; do
    docker volume ls --filter "$f" --format "$1"
  done | sort -u
}
floci_networks() {
  for f in label=io.floci=aws name=floci-aws- label=com.docker.compose.project=cms-local; do
    docker network ls --filter "$f" --format "$1"
  done | sort -u
}
# The volumes those containers mount, anonymous ones included (the k3s image declares several),
# outlive the containers floci deletes during destroy, so they are noted while they still exist.
mounted="$(floci_containers '{{.ID}}' | while read -r c; do
  docker inspect -f '{{range .Mounts}}{{if eq .Type "volume"}}{{println .Name}}{{end}}{{end}}' "$c" 2>/dev/null || true
done)"
mounted_left() { for v in $mounted; do if docker volume inspect "$v" >/dev/null 2>&1; then echo "$v"; fi; done; }

if aws_bootstrap sts get-caller-identity >/dev/null 2>&1 && [ -f "$AWS_DIR/credentials" ]; then
  for stack in gitops infra global; do
    "$(dirname "$0")/tf.sh" local "$stack" destroy -auto-approve -input=false || warn "destroy $stack failed; continuing"
  done
fi

# A failed removal does not stop the teardown: the F6 check at the end reports what is left.
docker compose -f "$COMPOSE_FILE" --profile app down -v --remove-orphans || true
ids="$(floci_containers '{{.ID}}')"
[ -z "$ids" ] || docker rm -f -v $ids >/dev/null || true
vols="$( { floci_volumes '{{.Name}}'; mounted_left; } | sort -u)"
[ -z "$vols" ] || docker volume rm $vols >/dev/null || true
# floci keeps the Docker network of a deleted VPC, and compose cannot remove cms-local while
# floci-spawned containers are still attached, so both go once the containers are gone.
nets="$(floci_networks '{{.ID}}')"
[ -z "$nets" ] || docker network rm $nets >/dev/null || true
rm -rf "$AWS_DIR" "$KUBECONFIG_LOCAL" "$LOCAL_DIR/.last-image-tag" "$LOCAL_DIR/.git-mirror-password"
find "$TF_DIR/stacks" -maxdepth 2 -type d -name '.terraform-local' -exec rm -rf {} +
remaining="$( { floci_containers 'container {{.Names}}'; floci_volumes 'volume {{.Name}}'
  mounted_left | sed 's/^/volume /'; floci_networks 'network {{.Name}}'; } | sort -u | paste -sd ' ' -)"
[ -z "$remaining" ] && log "F6 no floci containers, volumes or networks left" || warn "F6 leftovers: $remaining"
