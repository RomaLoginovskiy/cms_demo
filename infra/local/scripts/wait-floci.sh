#!/usr/bin/env bash
# Waits until floci answers AWS API calls.
. "$(dirname "$0")/lib.sh"

for _ in $(seq 1 90); do
  if aws_bootstrap sts get-caller-identity >/dev/null 2>&1; then
    log "floci is up at $FLOCI_URL"
    exit 0
  fi
  sleep 2
done
die "floci did not become ready at $FLOCI_URL (docker compose -f $COMPOSE_FILE logs floci)"
