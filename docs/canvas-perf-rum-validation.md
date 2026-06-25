# Canvas performance simulation — Coralogix RUM validation

Use **coralogix-server-watcher** MCP during/after a simulation run.

## Pre-flight

1. `read_rum_log_intro_docs_v1`
2. `read_dataprime_intro_docs_v1`
3. `get_datetime` — set `start_date` / `end_date` on queries

All RUM queries must include: `$l.subsystemname == 'cx_rum'`

Canvas app filter: `$d.cx_rum.version_metadata.app_name == 'cms-demo'` and/or `$d.cx_rum.labels.subsystem == 'canvas-frontend'`

## Soft navigation (SPA route changes)

RUM init sets `trackSoftNavigations` from `CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS` (enabled when unset). The browser must expose the soft-navigation Performance API.

### Chromium prerequisite

Launch Chromium with experimental web platform features, for example:

```bash
chromium --enable-experimental-web-platform-features
# or Chrome:
google-chrome --enable-experimental-web-platform-features
```

Without this flag, init still succeeds but no soft-navigation page views are emitted.

### Manual check (canvas)

1. Open canvas app with RUM key configured.
2. Navigate `/` → open a board (`/boards/:id`) → back to `/`.
3. In Explore, confirm page events whose URL path includes `/boards/`.

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.labels.subsystem == 'canvas-frontend'
| filter $d.cx_rum.page_context.page_url ~ '/boards/'
```

Optional: filter `event_context.type == 'web-vitals'` after a soft nav to see per-route partial vitals (TTFB, FCP, LCP, CLS, INP).

Disable soft nav without redeploy: set `CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS=false` in runtime env.

## Scenario S1 — 5–6s interaction lag (`no_optimistic`)

Confirm simulation armed:

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.event_context.type == 'custom-measurement'
| filter $d.cx_rum.custom_measurement_context.name == 'canvas_lag_sim_active'
| filter $d.cx_rum.labels.subsystem == 'canvas-frontend'
```

Degraded commit latency (pass: p95 ≥ delayMs × 0.9):

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.event_context.type == 'custom-measurement'
| filter $d.cx_rum.custom_measurement_context.name == 'whiteboard_interaction_commit_duration_ms'
| filter $d.cx_rum.labels.subsystem == 'canvas-frontend'
| groupby roundTime(1m) aggregate percentile($d.cx_rum.custom_measurement_context.value:num, 0.95) as p95_ms
```

## Scenario S2 — large board text-edit freeze

Text edit commit (pass: p95 ≥ 450ms with enough shapes on board):

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.event_context.type == 'custom-measurement'
| filter $d.cx_rum.custom_measurement_context.name == 'whiteboard_text_edit_commit_duration_ms'
| filter $d.cx_rum.labels.subsystem == 'canvas-frontend'
| groupby roundTime(1m) aggregate percentile($d.cx_rum.custom_measurement_context.value:num, 0.95) as p95_ms
```

Shape count on board:

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.event_context.type == 'custom-measurement'
| filter $d.cx_rum.custom_measurement_context.name == 'whiteboard_board_shape_count'
| filter $d.cx_rum.custom_measurement_context.value:num >= 1000
```

Long tasks during edits:

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.event_context.type == 'longtask'
| filter $d.cx_rum.labels.subsystem == 'canvas-frontend'
```

## Baseline (simulation off, small board)

- `whiteboard_interaction_commit_duration_ms` p95 &lt; 500ms
- `whiteboard_text_edit_commit_duration_ms` p95 &lt; 100ms

## RUM demo scenarios (S01–S14)

All queries include `$l.subsystemname == 'cx_rum'` and `$d.cx_rum.labels.subsystem == 'canvas-frontend'`.

### Loadgen synthetic user context

Every canvas-load virtual user navigates with a `rum_user` query param. After RUM init, the frontend calls `CoralogixRum.setUserContext` with deterministic synthetic profiles (`user_metadata.loadgen=1`). This applies in **production** as well; `RUM_DEMO_ALLOW_PROD` gates demo scenario injectors only, not loadgen user context. Organic sessions without `rum_user` use the whiteboard `localStorage` display name.

Distinct roles across a load run (pass: ≥3 roles when users.count ≥ 30):

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.labels.subsystem == 'canvas-frontend'
| filter $d.cx_rum.user_context.user_metadata.loadgen == '1'
| groupby $d.cx_rum.user_context.user_metadata.role aggregate count() as sessions
```

Filter errors by synthetic user role during UC2 plan mix:

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.event_context.type == 'error'
| filter $d.cx_rum.user_context.user_metadata.loadgen == '1'
| groupby $d.cx_rum.user_context.user_metadata.role, $d.cx_rum.labels.plan aggregate count() as errors
```

### S01 — Critical-flow error spike

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.event_context.type == 'error'
| filter $d.cx_rum.labels.rum_scenario == 's01'
| groupby $d.cx_rum.error_context.fingerPrint aggregate count() as sessions
```

Pass: single stable fingerprint across ≥ 50 sessions in a 15-minute window.

### S04 vs S05 — Impact contrast (plan mix)

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.event_context.type == 'error'
| filter $d.cx_rum.labels.rum_scenario in ['s04', 's05']
| groupby $d.cx_rum.labels.plan aggregate count() as error_count
```

Pass: `plan=free` count >> `plan=enterprise`; enterprise errors present but low volume.

### S06 — Slow backend API

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.event_context.type == 'network-request'
| filter $d.cx_rum.labels.rum_scenario == 's06'
| groupby roundTime(1m) aggregate percentile($d.cx_rum.network_request_context.duration:num, 0.95) as p95_ms
```

Pass: p95 ≥ 3500ms.

### S09 — Version error delta

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.event_context.type == 'error'
| filter $d.cx_rum.labels.rum_scenario == 's09'
| groupby $d.cx_rum.version_metadata.version aggregate count() as errors
```

Pass: `v=1.95821` error rate > `v=1.92903`; new fingerprint only in newer version.

### S12 — Long tasks vs widgetCount

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.event_context.type == 'longtask'
| filter $d.cx_rum.labels.rum_scenario == 's12'
| filter $d.cx_rum.labels.widgetCount:num >= 1000
```

### S13 — WebSocket disconnect loop

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.log_context.message == 'miro.ws.closed'
| filter $d.cx_rum.labels.rum_scenario == 's13'
| filter $d.cx_rum.log_context.data.wasClean == false
```

### Board load journey (S02)

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.log_context.message in ['miro.board.load.started', 'miro.board.load.fullyInteractive']
| filter $d.cx_rum.labels.rum_scenario == 's02'
```

Pass: sessions with `started` but missing `fullyInteractive`.

### Journey event catalog (board load, AI, collab)

Verify canonical custom journey logs by message name:

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.labels.subsystem == 'canvas-frontend'
| filter $d.cx_rum.log_context.message == 'miro.board.load.firstWidgetVisible'
```

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.labels.subsystem == 'canvas-frontend'
| filter $d.cx_rum.log_context.message == 'miro.board.load.failed'
| groupby $d.cx_rum.log_context.data.phase aggregate count() as failures
```

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.labels.subsystem == 'canvas-frontend'
| filter $d.cx_rum.log_context.message == 'miro.meet.joined'
```

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.labels.subsystem == 'canvas-frontend'
| filter $d.cx_rum.log_context.message == 'miro.ai.run.first_token'
| groupby roundTime(1m) aggregate avg($d.cx_rum.log_context.data.ttft_ms:num) as avg_ttft_ms
```

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.labels.subsystem == 'canvas-frontend'
| filter $d.cx_rum.log_context.message == 'miro.ai.run.failed'
| filter $d.cx_rum.labels.rum_scenario == 's11'
```

Board load funnel ordering (happy path):

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.labels.subsystem == 'canvas-frontend'
| filter $d.cx_rum.log_context.message in [
    'miro.board.load.started',
    'miro.board.load.firstWidgetVisible',
    'miro.board.load.fullyInteractive'
  ]
| groupby $d.cx_rum.labels.board_load_id aggregate count() as milestones
```

Pass: each `board_load_id` has 3 milestones on successful loads.
