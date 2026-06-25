# Canvas RUM Demo Scenarios (Component Contract)

## Purpose

Orchestrate **14 Coralogix RUM demo scenarios** for `canvas-frontend`: session labels, fault injection, journey telemetry, control panel, and headless replay—without coupling whiteboard UI to ad-hoc demo branches.

## Module structure

```
canvas-frontend/src/observability/
├── coralogixRum.ts              # init + setUserContext when rumUserContext set
├── rumUserContext.ts            # parse rum_user param; applyRumUserContext (new, optional split)
├── canvasLagSim.ts              # unchanged contract; invoked by scenarios S07/S10/S12
├── rumSessionConfig.ts          # parse URL + __APP_CONFIG__ → RumSessionConfig
├── rumLabelContext.ts           # mutable session labels (plan, feature_area, …)
├── rumBeforeSend.ts             # compose: enrichLabels → redactUrls → scenario hooks
├── rumTracing.ts                # traceparent / sentry-trace for fetch + hub
├── rumScenarios/
│   ├── types.ts                 # RumScenarioId, RumScenarioDefinition, RumDemoGate
│   ├── registry.ts              # Map id → definition; resolveScenario()
│   ├── activate.ts              # start/stop lifecycle, compose lag sim
│   └── scenarios/
│       ├── s01-critical-error-spike.ts
│       ├── s02-board-load-abandon.ts
│       ├── … s14-resource-chunk-failure.ts
├── rumJourney/
│   ├── journeyEvents.ts         # whiteboard_journey_* helpers
│   └── aiJourneySteps.ts        # S11 seven-step script
└── rumDemoPanel/
    ├── RumDemoPanel.tsx         # floating panel (dev/demo builds)
    ├── useRumDemoPanel.ts
    └── rumDemoPanel.test.tsx
```

**Integration points** (thin hooks only):

| File | Hook |
|---|---|
| `index.tsx` | `parseRumSessionConfig()` → `initializeCoralogixRum(config, labelContext)` → `activateScenario(config.scenario)` |
| `App.tsx` | Render `<RumDemoPanel />` when `isRumDemoEnabled()` |
| `whiteboardApi.ts` | `fetchWithRumTracing()` wrapper |
| `boardHubClient.ts` | tracing headers + S13 disconnect injector |
| `WhiteboardPage.tsx` | board load journey (S02), `widgetCount` refresh |
| `measurements.ts` | optional: merge `rumLabelContext` into log labels (beforeSend still authoritative) |

## Session config from URL params

### Query parameter contract

| Param | Alias | Type | Default | Example |
|---|---|---|---|---|
| `rumDemo` | — | `1` \| `0` | `0` | `rumDemo=1` |
| `plan` | — | enum | `free` | `plan=enterprise` |
| `v` | `version` | semver string | `__APP_CONFIG__.CORALOGIX_APP_VERSION` | `v=1.95821` |
| `scenario` | `s` | `s01`…`s14` | none | `scenario=s05` |
| `feature_area` | `area` | string | `board` | `feature_area=media` |
| `releaseRing` | `ring` | enum | `stable` | `ring=canary` |
| `delayMs` | — | number | scenario default | `delayMs=3500` |
| `errorRate` | — | 0–1 | scenario default | `errorRate=0.15` |
| `geo` | — | string | — | `geo=eu-west` (label only unless loadgen sets real geo) |
| `batchId` | — | string | — | correlates headless run |
| `rum_user` | — | base64url JSON | — | Synthetic RUM user (ADR-006); loadgen only in v1 |

**Example URL**

```
/boards/{id}?rumDemo=1&plan=enterprise&v=1.95821&scenario=s05&ring=canary&feature_area=board
```

### Resolution order (highest wins)

1. In-app panel overrides (sessionStorage key `rum_demo_overrides`, cleared on “Reset”)
2. URL search params (parsed once at boot; `popstate` re-parse optional v2)
3. `window.__APP_CONFIG__` (`RUM_DEMO_*`, `CORALOGIX_APP_VERSION`)
4. Built-in defaults

### `RumSessionConfig` shape

```typescript
interface RumSessionConfig {
  demoEnabled: boolean;
  allowProd: boolean;
  plan: 'free' | 'enterprise' | 'team';
  version: string;
  scenarioId: RumScenarioId | null;
  featureArea: string;
  releaseRing: 'stable' | 'canary' | 'internal';
  delayMs?: number;
  errorRate?: number;
  demoGeo?: string;
  demoBrowserFamily?: string;
  batchId?: string;
}
```

Export `buildSessionQuery(config): string` for loadgen symmetry.

## beforeSend enrichment pattern

```typescript
// rumBeforeSend.ts — ordered pipeline; each stage returns event or null (drop)
type BeforeSendStage = <T extends RumEvent>(event: T) => T | null;

const stages: BeforeSendStage[] = [
  enrichSessionLabels,      // merge rumLabelContext → event.labels
  enrichTraceCorrelation,   // S08: network events ← traceparent / sentry-trace
  scenarioBeforeSendHook,   // active scenario may add labels or drop noise (S04)
  redactRumEventUrls,       // existing strip search/hash
];
```

**Rules**

- All stages run for every event type unless scenario registers `eventTypes` filter.
- `enrichSessionLabels` sets: `plan`, `feature_area`, `releaseRing`, `widgetCount`, `rum_scenario`, `demo_geo`, `demo_browser_family`, `batch_id`.
- `widgetCount` updated at most every 2s or on board load (avoid cardinality storm).
- Unknown fields on incoming SDK events: **preserve** SDK payload; only add/override documented labels.
- Dropping events (S04 high-volume noise) must increment `window.__RUM_DEMO_STATS__.dropped` for panel visibility—never silent discard without counter.

**Init wiring** (`coralogixRum.ts`):

```typescript
CoralogixRum.init({
  version: sessionConfig.version,
  labels: { subsystem: '…', plan: sessionConfig.plan, … },
  beforeSend: (event) => runBeforeSendPipeline(event, sessionConfig),
  …
});
```

Duplicate labels in `init.labels` and `beforeSend` are intentional: init seeds session; beforeSend keeps `widgetCount` fresh.

## Scenario registry

```typescript
interface RumScenarioDefinition {
  id: RumScenarioId;
  title: string;
  description: string;
  requiredPlan?: RumSessionConfig['plan'];
  defaultParams: { delayMs?: number; errorRate?: number };
  activate(ctx: RumScenarioContext): void | (() => void); // teardown
  beforeSend?: BeforeSendStage;
}

interface RumScenarioContext {
  config: RumSessionConfig;
  labels: RumLabelContext;
  lagSim: typeof canvasLagSim;
  journey: typeof journeyEvents;
  schedule: (fn: () => void, ms: number) => number;
}
```

### Per-scenario behavior summary

| Id | Activate | Key measurements / logs |
|---|---|---|
| S01 | Timer throws `Error` + `CoralogixRum.captureError` at `errorRate` | `error` events; label `rum_scenario=s01` |
| S02 | On board route: emit `whiteboard_journey_board_load` `step=started`; abort before `fullyInteractive` (timeout or nav away) | Missing `fullyInteractive` timing |
| S03 | No FE fake geo; relies on loadgen context + `demo_geo` label | Cluster by labels in CX |
| S04 | Flood Info custom logs + low-severity measurements | High event volume, `plan=free` |
| S05 | Sparse critical errors + poor INP injection | `plan=enterprise`, errors |
| S06 | Set `X-Rum-Demo: slow-api` on all board API fetches | `whiteboard_*` + network duration |
| S07 | `activateLagSim({ mode: 'hub_outbound', delayMs: 3500 })` | Same as S06 symptom, no BE delay |
| S08 | `rumTracing.injectHeaders()` on fetch/hub | `labels.trace_id` on network RUM events |
| S09 | Version-specific `errorRate` map (`1.92903` > `1.95821`) | Filter `$d.cx_rum.version_metadata.version` |
| S10 | Version-specific `main_thread` ms map | INP / longtask by version |
| S11 | Run `aiJourneySteps` sequential 7 logs | `whiteboard_journey_ai_assist` steps 1–7 |
| S12 | `large_board_render` or `main_thread` from ADR-004 | `longtask`, `whiteboard_text_edit_commit_duration_ms` |
| S13 | Periodic hub stop/start or proxy fault | `whiteboard_hub_*` measurements |
| S14 | Dynamic import of missing chunk or `<script src>` 404 | `resource` / `error` RUM events |

## Control panel UX

- **Placement**: fixed bottom-right drawer; `data-testid="rum-demo-panel"`.
- **Visibility**: `rumDemo=1` OR non-production OR `RUM_DEMO_PANEL=always`.
- **Controls**: scenario picker (grouped UC1–4 / Bonus), plan, version, release ring, feature area, delay/error sliders, Active indicator, **Apply** (writes sessionStorage + reloads optional), **Run once** (activates without reload).
- **Read-only telemetry**: session id snippet, `widgetCount`, dropped-event counter, active lag mode.
- **Safety**: banner when `production` without `allowProd`.

## Backend mock endpoints (canvas-backend)

Gated by `RUM_DEMO_ENABLED=true` (default false). Invalid or missing gate → middleware no-op (404 for dedicated demo routes).

| Method | Path | Behavior |
|---|---|---|
| — | Middleware on `/api/boards/*` | If `X-Rum-Demo: slow-api`, `Task.Delay(3500)` before handler |
| GET | `/api/demo/rum/health` | `{ demoEnabled: true }` for FE preflight |
| GET | `/api/demo/rum/chunk/{name}` | S14: returns 404 JSON `{ "error": "chunk_missing" }` |
| — | SignalR (optional v2) | Hub message delay when `X-Rum-Demo: slow-hub` |

**Headers (FE → BE)**

| Header | Scenario |
|---|---|
| `X-Rum-Demo: slow-api` | S06 |
| `X-Rum-Demo: fail-next` | optional 500 injection |
| `traceparent` / `sentry-trace` | S08 (W3C + Sentry format for workshop) |

OpenTelemetry on `canvas-backend` is **out of scope** for v1; trace correlation is RUM-network ↔ header id, not full APM backend spans.

## Headless batch runner (loadgen/canvas-load)

New files:

```
loadgen/canvas-load/src/rum/
  rumSessionPlan.ts      # matrix generation
  buildRumQuery.ts
  rumBatchProfiles.ts    # named presets: uc1_spike, uc2_mixed, uc4_versions
config/rum-batch.yaml
```

**Config extension** (`LoadConfig`):

```yaml
rum_batch:
  enabled: true
  preset: uc1_critical_spike   # or explicit matrix
  matrix:
    - { plan: free, v: "1.95821", scenario: s04, count: 40 }
    - { plan: enterprise, v: "1.95821", scenario: s05, count: 10 }
```

**VirtualBrowserUser**: after `resolveTargetUrl`, `page.goto(`${baseUrl}/boards/${id}?${buildRumQuery(plan)}`)`.

**BoardListPage.openBoardById**: accept optional query suffix from behavior context.

**Prometheus**: `canvas_load_rum_sessions_total{scenario,plan,version}`.

## Fitness functions

| Scenario | Automated check | DataPrime check (manual/CI script) |
|---|---|---|
| S01 | loadgen 50 users, `pageerror` metric ↑ | error count by `rum_scenario=s01` ≥ 50 sessions |
| S04 vs S05 | same run, different `plan` label counts | free volume >> enterprise; enterprise errors > 0 |
| S06 | API integration test with header, p95 ≥ 3.5s | network duration filter |
| S08 | unit: trace id on mocked beforeSend network event | `$d.cx_rum.labels.trace_id` populated |
| S09 | two deploys or two `v=` batches | error rate `v=1.92903` > `1.95821` |

## Dependencies

- `@coralogix/browser` SDK `beforeSend`, `labels`, `version`, custom logs/measurements
- ADR-004 `canvasLagSim` for S07, S10, S12
- `measurementService` / existing `whiteboard_*` names
- `loadgen/canvas-load` Playwright contexts for S01/S03 batch scale

## Error modes

| Condition | Behavior |
|---|---|
| `scenario` unknown | Console warn + RUM warn log; no activation |
| `rumDemo=0` and scenario in URL | Scenario ignored; log once |
| RUM key missing | Existing `initializeCoralogixRum` false return; scenarios no-op |
| S06 without BE demo flag | FE still sends header; API normal speed—panel shows “BE demo off” |
| Prod without allow | Demo gate blocks injectors; panel shows blocked state |
