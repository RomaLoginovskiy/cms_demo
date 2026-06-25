# ADR-004: In-App Canvas Lag Simulation

**Status**: Accepted  
**Date**: 2026-05-28

## Context

Demo and observability workflows need reproducible “board feels 5–6s behind” behavior in the canvas whiteboard. Today:

- **Optimistic UI**: `CanvasSurface.tsx` calls `useWhiteboardStore.upsertShape` immediately; hub sync via `WhiteboardPage` → `BoardHubClient.invoke` (`boardHubClient.ts`).
- **RUM**: `coralogixRum.ts` + `measurements.ts`; k8s `canvas-frontend-deployment.yaml` sets `CORALOGIX_SUBSYSTEM=canvas-frontend`.
- **Load**: `loadgen/canvas-load` chaos (`chaos.ts`) stresses navigation/tools, not in-app interaction latency.

Target symptom: **~5–6s from interaction commit to perceived completion** (hub round-trip and/or main-thread stall), visible in RUM.

## Evaluation Criteria

| Characteristic | Priority |
|---|---|
| Observability | Must emit distinguishable RUM for validation |
| Safety | Zero effect on prod unless explicitly enabled |
| Testability | Deterministic with fake timers; optional Playwright |
| Maintainability | Single config surface; no scattered `setTimeout` |

| Characteristic | Hub delay | Inbound delay | Main-thread | Disable optimistic |
|---|---|---|---|---|
| Matches “slow server” | 5 | 2 | 1 | 5 |
| Multi-user realism | 3 | 5 | 1 | 4 |
| RUM signal clarity | 4 | 3 | 5 | 4 |
| **Total** | **12** | **10** | **7** | **13** |

## Decision

Introduce a **client-only lag simulator** module, configured via `window.__APP_CONFIG__` (extend `runtime-env.template.js` + `docker-runtime-env.sh`), default **off**.

### 1. Injection layers and modes

| Mode | `CANVAS_LAG_SIM_MODE` | Injection point | User perception |
|---|---|---|---|
| **Perceived commit lag** (default) | `hub_outbound` | Wrap `BoardHubClient` private `invoke` — `await delay()` before/after `connection.invoke` | Drag looks instant; **commit** (pointer-up, property change, `placeImage`) stalls until hub resolves |
| **Collaboration lag** | `hub_inbound` | Delay before calling handlers registered in `WhiteboardPage` (`onShapeUpdated`, etc.) | Local edits fast; **remote** cursors/shapes late |
| **Main-thread jank** | `main_thread` | `busyWait` or repeated sync work at start of canvas redraw (`CanvasSurface` rAF path) | Pointer move / paint stutters; INP/Long Task RUM |
| **Full perceived lag** | `no_optimistic` | Gate `upsertShape` in `CanvasSurface` / `WhiteboardPage` until hub promise resolves | Entire interaction feels 5–6s slow |

Do **not** inject delay in `loadgen/canvas-load` for RUM validation — Playwright cannot emit browser RUM the same way.

### 2. Runtime config contract

| Key | Default | Notes |
|---|---|---|
| `CANVAS_LAG_SIM_ENABLED` | `false` / empty | Master switch |
| `CANVAS_LAG_SIM_MODE` | `hub_outbound` | Enum above |
| `CANVAS_LAG_SIM_DELAY_MS` | `5500` | Target 5–6s |
| `CANVAS_LAG_SIM_JITTER_MS` | `0` | Optional ± |
| `CANVAS_LAG_SIM_ALLOW_PROD` | `false` | Required to run when `CORALOGIX_ENVIRONMENT=production` |

**Activation rule**: `ENABLED=true` **and** (`ENVIRONMENT != production` **or** `ALLOW_PROD=true`). Log one RUM info event on boot with effective config (no secrets).

### 3. RUM measurements (add via `measurementService`)

| Name | When | Labels |
|---|---|---|
| `whiteboard_interaction_commit_ms` | pointer-up / color commit / text commit → hub settled | `hub_method`, `shape_type`, `lag_sim_mode` |
| `whiteboard_hub_invoke_ms` | wrap existing `invoke` | `hub_method`, `lag_sim_mode` |
| `canvas_lag_sim_active` | init when enabled | `mode`, `delay_ms` |

Use `startTimeMeasurement` / `endTimeMeasurement` (`measurements.ts`) for durations; keep existing counters (`whiteboard_shape_created`, etc.).

### 4. DataPrime validation (RUM logs)

Filter canvas subsystem, then custom measurement logs:

```text
source logs
| filter $l.subsystem == 'canvas-frontend'
| filter $d.measurement_name ~ 'whiteboard_interaction_commit_ms'
| groupby roundTime(1m) aggregate avg($d.measurement_value) as avg_ms, percentile($d.measurement_value, 0.95) as p95_ms
```

Confirm sim armed:

```text
source logs
| filter $l.subsystem == 'canvas-frontend'
| filter $d.measurement_name == 'canvas_lag_sim_active'
```

Main-thread mode — long tasks / high INP:

```text
source logs
| filter $l.subsystem == 'canvas-frontend'
| filter $d.event_type == 'longTask' or $d.metric_name == 'inp'
```

(Exact RUM field paths: confirm with `get_schemas_v1` / `read_rum_log_intro_docs_v1` on tenant.)

Metrics: `search_metrics` for exported custom measurement series if E2M enabled.

### 5. Safety

- Defaults off in `runtime-env.js`; **omit** lag keys from `k8s/canvas-frontend-deployment.yaml` prod manifest.
- Enable only on **canvas-load** overlay, local dev, or staging (`CORALOGIX_ENVIRONMENT=load-test`).
- Never combine `ALLOW_PROD=true` with lag in the primary demo ingress without runbook approval.

### 6. Test strategy

| Layer | Scope |
|---|---|
| **Unit** | Lag shim: fake timers, `hub_outbound` delays `invoke`, `no_optimistic` blocks store until resolve; env gate rejects prod |
| **E2E** (optional) | `canvas-frontend/tests/e2e/whiteboard.spec.ts`: inject config via test `runtime-env` or `?canvasLagSim=hub_outbound:5500`; assert `data-testid="connection-status"` + action timeout |
| **Load** | Run `canvas-load` collaborator profile with lag enabled on frontend deploy; correlate RUM p95 with `canvas_load_*` Prometheus metrics |

## Scenario S2 — large board text-edit freeze (thread 20982)

| Mode | `large_board_render` |
|---|---|
| Symptom | ~1,300 objects; 0.5–1s freeze per text commit (blur) |
| Root cause | O(n) `renderScene` after `commitText` → `upsertShape` |
| Seeding | `loadgen/canvas-load/scripts/seed-large-board.mts` (`npm run seed-board`) |
| RUM | `whiteboard_text_edit_commit_ms`, `whiteboard_board_shape_count` |
| K8s overlay | `k8s/overlays/canvas-perf-large-board/` (`RENDER_COST_US` fallback) |
| Load profile | `text_editor` + scenario `large_board` |

## Implications

- **Positive**: Reproducible SRE/demo scenarios S1 and S2; correlates with existing optimistic architecture.
- **Risks**: Misconfigured prod env could slow real users — mitigated by double gate.
- **Implemented**: `canvasLagSim.ts`, `whiteboardCommit.ts`, k8s overlays, loadgen seeder + `text_editor` profile.

## Consultation

Architecture review of `CanvasSurface.tsx`, `boardHubClient.ts`, `WhiteboardPage.tsx`, `measurements.ts`, `coralogixRum.ts`, ADR-002 load generator.
