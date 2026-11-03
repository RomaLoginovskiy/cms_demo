#!/usr/bin/env bash
# Runs the k6 API load in a container next to floci (no local k6 install needed).
# Usage: load.sh start [rate] | stop | status | logs
. "$(dirname "$0")/lib.sh"

name="cms-incident-k6"
case "${1:-status}" in
  start)
    rate="${2:-${RATE:-40}}"
    docker rm -f "$name" >/dev/null 2>&1 || true
    docker run -d --name "$name" --restart unless-stopped \
      -e RATE="$rate" -e API_URL="${K6_API_URL:-http://host.docker.internal:8080/api}" \
      -v "$DEMO_DIR/load:/scripts:ro" grafana/k6:latest run --quiet /scripts/api.js >/dev/null
    log "k6 started at $rate req/s (docker logs -f $name)"
    ;;
  stop)
    docker rm -f "$name" >/dev/null 2>&1 || true
    log "k6 stopped"
    ;;
  status)
    docker ps --filter "name=^${name}$" --format '{{.Names}} {{.Status}}'
    ;;
  logs)
    docker logs --tail 40 "$name"
    ;;
  *)
    die "usage: $0 start [rate] | stop | status | logs"
    ;;
esac
