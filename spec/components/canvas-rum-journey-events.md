# Canvas RUM Journey Events (Component Contract)

## Purpose

Define the **canonical Miro-style journey event catalog** for `canvas-frontend`, emission API, payload contracts, production hook points, demo-only flows, and test/fixture requirements. All journey telemetry flows through `rumJourney/` → `emitJourney` → `rumInfoLog`.

## Module layout

```
canvas-frontend/src/observability/rumJourney/
├── journeyEvents.ts           # canonical emitters + emitJourney()
├── aiJourneySteps.ts          # S11 / demo AI script (canonical + extended tiers)
├── signupCheckoutJourney.ts   # NEW — demo-only signup/checkout script
├── journeyContext.ts          # NEW — board_load_id lifecycle (optional split from rumLabelContext)
└── __fixtures__/              # golden payloads per event
```

## Public API (`journeyEvents.ts`)

```typescript
// Core
export function emitJourney(eventName: string, data?: Record<string, unknown>, labels?: Record<string, string>): void;

// Board load (production)
export function emitBoardLoadStarted(boardLoadId: string): void;
export function emitBoardLoadFirstWidgetVisible(boardLoadId: string, widgetCount: number, elapsedMs: number): void;
export function emitBoardLoadLastWidgetVisible(boardLoadId: string, widgetCount: number, elapsedMs: number): void;
export function emitBoardLoadFullyInteractive(boardLoadId: string, widgetCount?: number): void;
export function emitBoardLoadFailed(boardLoadId: string, phase: 'api' | 'hub', error: unknown): void;

// WebSocket / hub (production)
export function emitWsOpened(url: string): void;
export function emitWsClosed(wasClean: boolean, code?: number): void;
export function emitWsReconnected(): void;
export function emitMeetJoined(boardId: string, presenceCount?: number): void;

// AI (demo today; canonical names for future prod)
export function emitAiPromptSubmitted(meta?: { variant?: string }): void;
export function emitAiRunFirstToken(ttftMs: number, meta?: Record<string, unknown>): void;
export function emitAiRunCompleted(meta?: Record<string, unknown>): void;
export function emitAiRunFailed(reason: string, meta?: Record<string, unknown>): void;
```

Extended AI steps remain internal to `aiJourneySteps.ts` and call `emitJourney` directly only when `shouldEmitAiExtendedSteps(config)` is true.

## Data contracts

### Common fields (all journey logs)

| Field | Location | Required | Description |
|---|---|---|---|
| `journey_event` | `data` | yes | Duplicate of log message / event name |
| `step` | `data` | yes | Short milestone id within funnel |
| `journey` | RUM `labels` | yes | Same as event name (existing) |
| `board_load_id` | `labels` | board-scoped events | UUID per `WhiteboardPage` mount |

### Board load funnel

| Event | When | Extra `data` |
|---|---|---|
| `miro.board.load.started` | Start of `load()` in `WhiteboardPage` | `step: started` |
| `miro.board.load.firstWidgetVisible` | First successful canvas paint in `CanvasSurface` | `widget_count`, `elapsed_ms` since started |
| `miro.board.load.lastWidgetVisible` | First full 2D+Mesh3D paint with shapes (see ADR-012) | `widget_count`, `elapsed_ms` |
| `miro.board.load.fullyInteractive` | After `hub.connect` completes | `widget_count` |
| `miro.board.load.failed` | `catch` in board load | `phase`, `error_kind` (no PII/stack) |

**Ordering invariant** (happy path): `started` → `firstWidgetVisible` → `lastWidgetVisible` (boards with shapes) → `fullyInteractive`. At most one terminal: `fullyInteractive` OR `failed`.

Custom time measurements `whiteboard_board_load_first_shape_visible` / `whiteboard_board_load_last_shape_visible` are defined in [Board Shape Load Timing](./board-shape-load-timing.md) — not interchangeable with `firstWidgetVisible`.

### AI funnel (canonical tier)

| Event | When |
|---|---|
| `miro.ai.prompt.submitted` | User or demo triggers AI |
| `miro.ai.run.first_token` | First token available | `ttft_ms` required |
| `miro.ai.run.completed` | Stream finished successfully |
| `miro.ai.run.failed` | Error / abort before completed | `reason` enum |

**Extended tier** (demo only, `aiDetail=extended`): `context.loaded`, `stream.opened`, `text.delta`, `text.completed`, `stream.closed` — prefixes remain `miro.ai.*`.

### WebSocket / collaboration

| Event | When | Extra `data` |
|---|---|---|
| `miro.ws.opened` | SignalR `start()` success | `url` (path-only redaction via existing pipeline) |
| `miro.ws.closed` | `onclose` / `onreconnecting` | `wasClean`, `code` |
| `miro.ws.reconnected` | `onreconnected` | — |
| `miro.meet.joined` | `JoinBoard` invoke success | `presence_count?` — maps collab “session joined”, not video |

### Signup / checkout (demo only)

| Event | `data.step` values |
|---|---|
| `miro.signup.step` | `email`, `verify`, `named` |
| `miro.checkout.step` | `plan`, `payment` |
| `miro.checkout.failed` | `reason` (e.g. `card_declined`) |
| `miro.checkout.confirmed` | `plan` from session label |

Gate: `isRumDemoInjectorsAllowed()` AND (`scenario=s15` OR panel “Run billing demo”).

## Dependencies

| Consumer | Producer |
|---|---|
| `WhiteboardPage.tsx` | board load started / failed / fullyInteractive |
| `CanvasSurface.tsx` | firstWidgetVisible |
| `boardHubClient.ts` | ws.*, meet.joined |
| `rumScenarios/s11` | `runAiJourney` |
| `rumScenarios/s15` (new) | `runSignupCheckoutJourney` |
| `RumDemoPanel.tsx` | optional manual triggers |
| `coralogixRum.rumInfoLog` | transport |
| `rumBeforeSend` | merges `plan`, `board_load_id`, `rum_scenario` |

## Error modes

| Failure | Detection | Emission |
|---|---|---|
| Board API error | `whiteboardApi.getBoard` throws | `board.load.failed` `phase=api` |
| Hub connect error | `hub.connect` throws | `board.load.failed` `phase=hub` |
| RUM not initialized | `rumInfoLog` no-op | Counter `journeyEventsEmitted` unchanged; test must init mock |
| Demo blocked in prod | injectors disallowed | signup/checkout script returns immediately with `rumWarnLog` |

## Fitness functions

| Function | Command / check |
|---|---|
| Emitter coverage | `npm test -- --testPathPattern=rumJourney` — 100% public emitters asserted |
| Funnel order | `journeyIntegration.test.ts` — snapshot event sequence for mock load |
| No stray miro logs | `rg "rumInfoLog\('miro\." canvas-frontend/src` only in `rumJourney/` |
| Canonical AI rename | Tests fail if `first_token.received` appears in canonical path |

## DataPrime validation (workshop)

Filter base (all queries):

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.labels.subsystem == 'canvas-frontend'
| filter $d.cx_rum.log_context.data.journey_event != null
```

Board load funnel completion rate:

```text
| filter $d.cx_rum.log_context.data.journey_event == 'miro.board.load.started'
| join on $d.cx_rum.labels.board_load_id
  (filter $d.cx_rum.log_context.data.journey_event == 'miro.board.load.fullyInteractive')
```

TTFT (canonical AI):

```text
| filter $d.cx_rum.log_context.data.journey_event == 'miro.ai.run.first_token'
| groupby roundTime(1m) aggregate avg($d.cx_rum.log_context.data.ttft_ms:num) as avg_ttft
```

## Contract test process

1. Capture failing or sample RUM payload from Coralogix Explore.
2. Redact URLs/PII; save under `__fixtures__/<event>.json`.
3. Add test: `emitX()` → compare `rumInfoLog` mock call to fixture.
4. Update this contract if fields added (ADR-010 amendment).

## Related spec

- [ADR-010: Journey Event Catalog](../adr/ADR-010-canvas-rum-journey-event-catalog.md)
- [ADR-005: RUM Demo Scenarios](../adr/ADR-005-coralogix-rum-demo-scenarios.md)
- [Canvas RUM Demo Scenarios](./canvas-rum-demo-scenarios.md)
- [Canvas perf RUM validation](../../docs/canvas-perf-rum-validation.md)
