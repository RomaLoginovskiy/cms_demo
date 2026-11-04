#!/usr/bin/env bash
# Builds the seven images for the host architecture and pushes them to floci ECR (path-style URIs).
# Tags are immutable: an existing tag is skipped, never re-pushed. Prints the tag on stdout.
. "$(dirname "$0")/lib.sh"
use_identity

registry="localhost:4566/$ACCOUNT_ID/$REGION"
platform="$(host_platform)"
skip=" ${SKIP_IMAGES:-} "

tag="sha-$(git -C "$ROOT" rev-parse --short=12 HEAD)"
if [ -n "$(git -C "$ROOT" status --porcelain -- backend canvas-backend frontend canvas-frontend loadgen/canvas-load)" ]; then
  tag="$tag-dirty-$(date +%s)"
fi

aws ecr get-login-password --endpoint-url "$FLOCI_URL" | \
  docker login --username AWS --password-stdin localhost:4566 >/dev/null

# service | build context | Dockerfile (both relative to the repository root)
while read -r service context dockerfile; do
  [ -n "$service" ] || continue
  case "$skip" in *" $service "*) warn "skipping $service (SKIP_IMAGES)"; continue ;; esac
  image="$registry/$PROJECT/$service:$tag"
  if aws ecr describe-images --endpoint-url "$FLOCI_URL" --repository-name "$PROJECT/$service" \
      --image-ids "imageTag=$tag" >/dev/null 2>&1; then
    log "$service:$tag already in ECR"
    continue
  fi
  log "building $service ($platform)"
  docker build --platform "$platform" -t "$image" -f "$ROOT/$dockerfile" "$ROOT/$context" >&2
  docker push "$image" >&2
  # k3s pulls from floci's registry; the local copy only costs Docker Desktop disk (canvas-load ~3.5 GB).
  [ "${KEEP_LOCAL_IMAGES:-0}" = "1" ] || docker rmi "$image" >/dev/null
done <<LIST
cms-backend backend backend/Dockerfile
media-worker backend backend/DemoCms.MediaWorker/Dockerfile
cms-agent backend backend/DemoCms.Agent/Dockerfile
cms-frontend frontend frontend/Dockerfile
canvas-backend canvas-backend canvas-backend/Dockerfile
canvas-frontend canvas-frontend canvas-frontend/Dockerfile
canvas-load loadgen/canvas-load loadgen/canvas-load/Dockerfile
LIST

printf '%s\n' "$tag" > "$LOCAL_DIR/.last-image-tag"
log "images tagged $tag"
printf '%s\n' "$tag"
