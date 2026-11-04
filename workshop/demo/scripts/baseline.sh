#!/usr/bin/env bash
# Marks the current tip of the mirror's branch "local" as the demo baseline, after `make local-sync`
# has published a working tree that includes components/incident-postgres. reset.sh returns here.
. "$(dirname "$0")/lib.sh"

mirror_checkout
grep -q 'cpu: "2"' "$MIRROR_DIR/$PG_FILE" || die "$PG_FILE in the mirror does not have the 2-core limit; publish the baseline first"
grep -q 'replicas: 2' "$MIRROR_DIR/$BACKEND_FILE" || die "$BACKEND_FILE in the mirror does not have 2 replicas"

git -C "$MIRROR_DIR" tag -f "$BASELINE_TAG" >/dev/null
git -C "$MIRROR_DIR" push --quiet --force origin "refs/tags/$BASELINE_TAG"
publish_gitops_history
log "baseline: $BASELINE_TAG = $(git -C "$MIRROR_DIR" rev-parse --short HEAD)"
