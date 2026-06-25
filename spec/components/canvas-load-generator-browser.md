# Canvas Load Generator (Browser-First)

Canonical implementation contract. See [ADR-002](../adr/ADR-002-canvas-synthetic-load-generator.md).

> **Supersedes** protocol-only sections in [canvas-load-generator.md](canvas-load-generator.md) for v1.

## Purpose

Always-on Node/Playwright service driving **canvas-frontend** via real browsers. Configurable profiles, admin UI, stress/chaos modes. Full stack: SPA → nginx → canvas-backend → SQLite (+ CMS for media).

## Dependencies

| Direction | Target |
|-----------|--------|
| Outbound | `canvas-frontend` (browser) |
| Control | Prometheus scrape `:9091` |

## CLI

```
node dist/index.js [--config path] [--scenario name] [--dry-run]
```

Exit codes: `0` ok, `1` config invalid, `2` abort exit.

## Configuration

See `loadgen/canvas-load/config/load.yaml`. Env prefix `CANVAS_LOAD__`. Validation: `frontend_base_url` required; profile mix sum ≈ 1.0; `users.count` ≤ `max_contexts_per_pod`.

Scenarios: `smoke`, `stress`, `chaos`, `write_storm`, `fanout_storm`, `connection_churn`, `navigation_storm`, `media_storm`.

## Profiles (SPEC-5)

| Profile | ID | Summary |
|---------|-----|---------|
| lurker | PROF-01 | Join board, idle, sparse mousemove |
| active_drawer | PROF-02 | Draw shapes, occasional delete/move |
| collaborator | PROF-03 | Shared board, 33ms mousemove, selection, color edit |
| admin | PROF-04 | Board list CRUD via UI |
| media_placer | PROF-05 | Pictures picker + place image |
| chaos | PROF-06 | Reload, invalid routes, tool spam (overlay) |

## Selectors (SPEC-3)

- Board list: heading `Whiteboard Boards`, `#board-name` / `board-name-input`, `board-card`, `.board-open`
- Editor: `whiteboard-canvas`, `shape-count`, `connection-status`, tool buttons by role name
- Media: `Pictures`, `#picture-search`, `.media-result`

## Control API (SPEC-7)

- `GET /healthz`, `GET /api/control/state`, `GET|PUT /api/control/config`
- `POST /api/control/pause|resume`, `POST /api/control/scenario/{name}`
- `GET /metrics` on port 9091

## Metrics (SPEC-9)

`canvas_load_browser_contexts_active`, `canvas_load_actions_total`, `canvas_load_action_duration_seconds`, `canvas_load_page_errors_total`, `canvas_load_chaos_actions_total`, probes gauges.

## Fitness functions

| ID | Criterion |
|----|-----------|
| LF-01 | Smoke 5 users 60s, errorRate < 0.05 |
| LF-02 | Cross-tab shape sync < 500ms |
| LF-03 | Cleanup removes `loadgen*` boards |
| LF-04 | Chaos does not restart backend pod |
| LF-05 | Pause drains contexts < 30s |
| LF-06 | Ramp 5→15 users within ramp_up + 5s |

## File checklist (SPEC-16)

All paths under `loadgen/canvas-load/`, `k8s/canvas-load-*.yaml`, `work/milestones/M09-canvas-load-generator/README.md`.
