# ADR-010: Canvas RUM Journey Event Catalog (Miro-Aligned)

**Status**: Proposed  
**Date**: 2026-05-29

## Context

`canvas-frontend` emits custom RUM journey events via `emitJourney` → `rumInfoLog` (`journeyEvents.ts`). Production paths cover partial **board load** and **WebSocket** lifecycles; **AI** uses a seven-step synthetic script (`aiJourneySteps.ts`) aligned to demo scenario S11, not a real LLM integration. **Signup/checkout** and **meet.joined** are absent. Several names diverge from the Miro-style reference catalog used for Coralogix workshop dashboards.

Stakeholders need:

- Stable, filterable `miro.*` event names for DataPrime funnels
- Honest failure signals (no silent `catch` without `*.failed`)
- Demo parity for flows that do not exist in the product (signup/checkout)
- Tests that lock payload shape without requiring live Coralogix ingest

This ADR composes with ADR-005 (scenario registry), ADR-008 (session labels), and the existing `rumJourney/` module layout.

## Evaluation Criteria

| Characteristic | Priority |
|---|---|
| Observability | Funnel queries must use one canonical name per milestone |
| Testability | Deterministic unit tests; ordering assertions per `board_load_id` |
| Maintainability | Single `journeyEvents.ts` API; no scattered `rumInfoLog` in UI |
| Honest failure | Load/hub/AI errors emit `*.failed` with phase + redacted reason |
| Deployability | Signup/checkout demo-only; zero prod surface without demo gate |

| Characteristic | A: Rename all to catalog only | B: Catalog + extended tier (chosen) | C: Keep current names + alias labels |
|---|---|---|---|
| Observability | 5 | 5 | 3 |
| Testability | 4 | 5 | 4 |
| Maintainability | 4 | 4 | 2 |
| Dashboard migration cost | 2 (breaks S11 queries) | 4 | 5 |
| **Total** | **15** | **18** | **14** |

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| A. Strict catalog only | Simplest DataPrime | Loses TTFT/debug granularity for S11 demos |
| B. Canonical milestones + optional extended AI steps | Workshop funnels + deep AI demos | Two tiers to document and test |
| C. Dual `journey` label aliases | No renames | Single-Knob Illusion: message vs label mismatch |

## Decision

Adopt **Option B**: **canonical tier** (reference catalog names) for all production hook points and loadgen funnels; **extended tier** for AI intermediate steps, gated by demo and never required for funnel PASS criteria.

### 1. Event naming alignment

| Reference (canonical) | Current | Action |
|---|---|---|
| `miro.board.load.started` | same | keep |
| `miro.board.load.firstWidgetVisible` | missing | add |
| `miro.board.load.fullyInteractive` | same | keep |
| `miro.board.load.failed` | missing (silent catch) | add |
| `miro.ai.prompt.submitted` | same | keep (demo + future prod) |
| `miro.ai.run.first_token` | `miro.ai.first_token.received` | **rename** canonical emitter |
| `miro.ai.run.completed` | `miro.ai.run.completed` | keep |
| `miro.ai.run.failed` | missing | add variant in `runAiJourney` |
| `miro.ai.context.loaded`, `stream.opened`, `text.delta`, `text.completed`, `stream.closed` | extended only | emit only when `journeyAiDetail === 'extended'` (URL `aiDetail=extended` or S11 panel toggle) |
| `miro.ws.opened` / `closed` / `reconnected` | same | keep; ensure `code` + `wasClean` on every close |
| `miro.meet.joined` | missing (`whiteboard_hub_joined` measurement only) | add journey event on successful `JoinBoard` |
| `miro.signup.step`, `miro.checkout.*` | missing | **demo-only** scripted journey (see §4) |

**Log message** = event name (existing `rumInfoLog(eventName, …)` pattern). **Required payload fields** on every journey log: `journey_event`, `step`, plus correlation `board_load_id` for board-scoped events.

**TTFT**: canonical `miro.ai.run.first_token` MUST include `ttft_ms` (number). Extended steps may duplicate timing but funnel dashboards use canonical only.

### 2. Production hook points (missing events)

| Event | Hook | Trigger | Notes |
|---|---|---|---|
| `firstWidgetVisible` | `CanvasSurface.tsx` | First `requestAnimationFrame` callback after `renderScene` paints with `boardId` set in store and canvas has non-zero layout size | Once per `board_load_id`; empty boards still emit after first paint (0 shapes OK) |
| `fullyInteractive` | `WhiteboardPage.tsx` | After `hub.connect` resolves (existing) | Unchanged position in funnel |
| `failed` | `WhiteboardPage.tsx` | `catch` in board `load()` | `phase`: `api` \| `hub`; `error_kind`: exception name; no raw stack in prod |
| `meet.joined` | `boardHubClient.ts` `rejoin()` | After `JoinBoard` invoke succeeds | Include `board_id_hash`, `presence_count` if snapshot already received |
| `ws.closed` | `boardHubClient.ts` | Pass actual close code from SignalR where available; distinguish `onclose` vs `onreconnecting` | Today both use `1006`; improve when API exposes code |
| `run.failed` | `aiJourneySteps.ts` | New variant `failed` aborts before `run.completed` | Demo / `runOnce` only until real AI exists |

**Correlation**: `WhiteboardPage` generates `board_load_id` (uuid) at effect start; pass to `setBoardLoadContext({ boardLoadId })` in `rumLabelContext.ts`; merge into labels via `beforeSend` for all events during load window (cleared after `fullyInteractive` or `failed`).

### 3. Signup / checkout (no product flows)

| Approach | Decision |
|---|---|
| Skip entirely | Rejected — breaks workshop parity with reference catalog |
| Full fake UI | Rejected — scope creep |
| **Scripted demo journey** | **Accepted** — `signupCheckoutJourney.ts`, invoked from RumDemoPanel “Run billing demo” and optional `scenario=s15` |

Rules:

- Gated by `isRumDemoInjectorsAllowed()` (same as ADR-005)
- Steps: `signup.step` (`email` → `verify` → `named`), then `checkout.step` (`plan` → `payment`), then `checkout.confirmed` or `checkout.failed`
- `plan` step payload reads `rumLabelContext.plan` (panel already has plan selector)
- No routes, no persistence; sequential `emitJourney` with configurable delays
- Production default: **no emitters registered** unless demo gate passes

### 4. Cross-cutting enforcement layers

| Concern | Layers |
|---|---|
| Journey emit | `journeyEvents.ts` only (forbid direct `rumInfoLog('miro.')` elsewhere) |
| Demo-only signup/checkout | `signupCheckoutJourney.ts` + scenario/registry + `RUM_DEMO_ENABLED` gate |
| Labels on every RUM event | `rumBeforeSend` + `rumLabelContext` (ADR-005/008) |
| Board load correlation | `board_load_id` label during load; `journey` label = event name |
| Failure visibility | `WhiteboardPage` catch MUST call `emitBoardLoadFailed` — never status-only |

### 5. Test strategy (architectural gates)

| Layer | Requirement |
|---|---|
| Unit | `journeyEvents.test.ts`: each public emitter → one `rumInfoLog` with golden `journey_event`, labels |
| Unit | `aiJourneySteps.test.ts`: canonical path emits exactly 4 AI events; extended path emits 7+; `failed` omits `completed` |
| Unit | `signupCheckoutJourney.test.ts`: step order + `checkout.failed` variant |
| Component | `CanvasSurface.test.tsx`: mock rAF → single `firstWidgetVisible` per load id |
| Integration | `WhiteboardPage` load test: API reject → `failed` with `phase=api` |
| Integration | `boardHubClient.test.ts`: successful join → `meet.joined` |
| Contract fixtures | `canvas-frontend/src/observability/rumJourney/__fixtures__/*.json` from spec component contract |
| DataPrime smoke | Documented queries in `components/canvas-rum-journey-events.md`; manual/MCP per `docs/canvas-perf-rum-validation.md` |

Pre-merge gate: any new journey emitter requires fixture + unit test in same PR.

## Implications

- **Positive**: Workshop funnels align with Miro reference; S11 keeps deep AI telemetry without polluting canonical funnels
- **Negative**: Rename `first_token.received` → `run.first_token` breaks existing DataPrime saved views — document one-time alias query during migration window
- **Follow-up**: Implement hooks per component contract; add `s15` scenario or panel action; extend `docs/canvas-perf-rum-validation.md` with journey funnel queries

## Consultation

- Existing implementation: `journeyEvents.ts`, `aiJourneySteps.ts`, `WhiteboardPage.tsx`, `CanvasSurface.tsx`, `boardHubClient.ts`, ADR-005 scenario registry
