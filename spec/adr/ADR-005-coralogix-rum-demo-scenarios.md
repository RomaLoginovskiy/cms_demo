# ADR-005: Coralogix RUM Demo Scenarios (Canvas Frontend)

**Status**: Proposed  
**Date**: 2026-05-29

## Context

`canvas-frontend` initializes Coralogix RUM with a single `subsystem` label and URL redaction only (`coralogixRum.ts`). Product measurements exist (`whiteboard_*` via `measurementService`) but there are no journey events (`miro.*` / `whiteboard_journey_*`), no session dimensions (`plan`, `feature_area`, `releaseRing`, `widgetCount`), and no orchestrated demo faults for SRE/Coralogix workshops.

Stakeholders need **14 reproducible RUM scenarios** (UC1–UC4 + bonus) drivable by:

- URL query params (`?plan=enterprise&v=1.95821&scenario=…`)
- In-app demo control panel (non-headless)
- Headless batch replay (`loadgen/canvas-load`) with per-session plan/version matrix

`canvasLagSim.ts` (ADR-004) already covers hub/main-thread latency; it must compose with—not duplicate—the scenario registry.

## Evaluation Criteria

| Characteristic | Priority |
|---|---|
| Observability | Every scenario must be filterable in DataPrime via stable labels |
| Testability | Deterministic unit tests; headless replay without manual clicks |
| Safety | Demo faults off by default; prod requires explicit gate |
| Maintainability | One registry; no scattered `if (plan)` in UI components |
| Deployability | FE scenarios work with optional BE mocks; BE mocks env-gated |

| Characteristic | Monolithic scenario `if` chain | Registry + injectors | External-only (loadgen scripts only) |
|---|---|---|---|
| Observability | 2 | 5 | 2 |
| Testability | 2 | 5 | 3 |
| Maintainability | 2 | 5 | 3 |
| Headless RUM | 3 | 5 | 1 |
| **Total** | **9** | **20** | **9** |

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| A. Inline flags in components | Fast spike | Unmaintainable; breaks Single-Knob Illusion |
| B. Registry + session config + beforeSend labels (chosen) | Clear contracts; URL + panel + loadgen share one resolver | Up-front module split |
| C. loadgen-only (no in-app faults) | No FE risk | Playwright sessions ≠ real browser RUM for many faults |

## Decision

Adopt **Option B**: a `rumScenarios` registry under `canvas-frontend/src/observability/`, unified **session config** from URL + runtime + panel overrides, and a **beforeSend pipeline** that merges session labels onto every RUM event. Implement in phases:

1. **Phase 0 — Labels plumbing** (all scenarios depend on this)
2. **Phase 1 — S01, S04, S05, S09** (error spike, plan noise/impact, version errors)
3. **Phase 2 — S06, S12, S13** (slow backend, long-task, WebSocket health)
4. **Phase 3 — remainder** (S02, S03, S07, S08, S10, S11, S14)

### Session dimensions (labels on every event via `beforeSend`)

| Label | Source | Notes |
|---|---|---|
| `plan` | URL `plan` → panel → default `free` | `free` \| `enterprise` \| `team` |
| `feature_area` | URL `feature_area` → panel | e.g. `board`, `media`, `ai_assist` |
| `releaseRing` | URL `ring` or `releaseRing` | `stable` \| `canary` \| `internal` |
| `widgetCount` | Derived from store shape count, refreshed on board load | String integer |
| `rum_scenario` | URL `scenario` | Active scenario id, e.g. `s01` |
| `subsystem` | Existing runtime config | Unchanged |

**Version**: set `CoralogixRum.init({ version })` from URL `v` when present, else `CORALOGIX_APP_VERSION`. Required for S09/S10.

**Geo/browser clustering (S03)**: Do not fake geo in FE. For demos, loadgen sets Playwright `geolocation`, `locale`, `userAgent` per shard; labels include `demo_geo` and `demo_browser_family` only when `rumDemo=1`.

### Cross-cutting enforcement layers (Single-Knob Illusion)

| Concern | Layers that must agree |
|---|---|
| Demo enabled | URL `rumDemo=1` OR `RUM_DEMO_ENABLED=true` in `__APP_CONFIG__` OR panel toggle |
| Prod safety | `CORALOGIX_ENVIRONMENT=production` requires `RUM_DEMO_ALLOW_PROD=true` (mirror ADR-004 lag gate) |
| Slow API (S06) | FE `scenario=s06` adds header `X-Rum-Demo: slow-api` **and** BE `RUM_DEMO_ENABLED` middleware |
| Lag (S07/S12) | `canvasLagSim` mode from scenario activates only when demo gate passes |
| Trace (S08) | FE `fetch`/`hub` inject `traceparent` + optional `sentry-trace`; `beforeSend` copies to `labels.trace_id` on network events |

Misconfiguration must **fail loud**: unknown `scenario` → RUM warn log + panel error; never silent no-op.

### Scenario registry (14 ids)

| Id | Name | UC | Primary signal |
|---|---|---|---|
| S01 | `critical_error_spike` | UC1 | Uncaught errors + `rumError` burst; 50+ sessions via loadgen |
| S02 | `board_load_abandon` | UC1 | `miro.board.load.started` without `miro.board.load.fullyInteractive` |
| S03 | `geo_browser_cluster` | UC1 | Errors/metrics grouped by `demo_geo` / UA family |
| S04 | `free_plan_noise` | UC2 | High-volume benign logs/measurements, `plan=free` |
| S05 | `enterprise_high_impact` | UC2 | Few sessions, errors/INP, `plan=enterprise` |
| S06 | `slow_backend_api` | UC3 | API p95 ≥ 3500ms; BE delay middleware |
| S07 | `fe_slow_symptom` | UC3 | `hub_outbound` lag ~3500ms; same measurements as S06 |
| S08 | `trace_correlation` | UC3 | `traceparent` on API; RUM network event ↔ trace id |
| S09 | `version_error_delta` | UC4 | `v=1.92903` vs `1.95821`, injected error rate delta |
| S10 | `version_inp_regression` | UC4 | `main_thread` / interaction delay per version |
| S11 | `ai_journey_7step` | Bonus | 7-step `miro.ai.*` custom logs |
| S12 | `long_task_freeze` | Bonus | `large_board_render` or `main_thread` + longtask RUM |
| S13 | `websocket_health` | Bonus | Hub disconnect/reconnect + hub measurements |
| S14 | `resource_chunk_failure` | Bonus | Failed dynamic `import()` or static asset 404 |

### Journey events (`miro.*` prefix)

Use **`miro.*`** custom logs (severity Info) with stable `step` label—matching existing Coralogix dashboard queries. S11 implements 7 steps (`miro.ai.prompt.submitted` through `miro.ai.run.completed`); board load (S02) uses `miro.board.load.started` / `miro.board.load.fullyInteractive`; WebSocket health (S13) uses `miro.ws.opened` / `miro.ws.closed` / `miro.ws.reconnected`.

### Headless batch replay

Extend `loadgen/canvas-load` with `rum_batch` config: matrix of `{ plan, v, scenario, geo, userAgent }` per `userIndex`, appended as query string on every `page.goto`. Not a replacement for in-app panel—both call the same URL contract.

### Backend scope

Optional **env-gated** demo middleware in `canvas-backend` (see component contract). No changes to core board semantics when demo disabled.

## Implications

- **Positive**: Workshop queries use `$d.cx_rum.labels.plan`, `$d.cx_rum.version_metadata.version`, `$d.cx_rum.labels.rum_scenario`; aligns with existing `whiteboard_*` measurements and ADR-004 lag sim.
- **Negative / Risks**: Label cardinality if `widgetCount` updated too frequently—throttle to board open + every N shapes. Demo errors in prod if gate misconfigured—mitigate with startup RUM warn + k8s default `RUM_DEMO_ENABLED=false`.
- **Follow-up**: Implement component contract; add DataPrime recipes to `docs/canvas-perf-rum-validation.md`; wire CI smoke `scenario=s04` with RUM key in test env only.

## Consultation

Architecture review against existing `coralogixRum.ts`, `canvasLagSim.ts`, `measurementService`, `loadgen/canvas-load` VirtualBrowserUser, ADR-004.
