# ADR-012: Board Shape Load RUM Time Measurements

**Status**: Proposed  
**Date**: 2026-06-01

## Context

`canvas-frontend` already emits **journey** milestones for board load (`miro.board.load.*` via `rumJourney/`) and uses **`measurementService`** for interaction timings (`whiteboard_interaction_commit`, `whiteboard_hub_invoke`, etc.). Production code emits `miro.board.load.firstWidgetVisible` on the first canvas `requestAnimationFrame` after layout is non-zero, **without** requiring shapes on the board (see `CanvasSurface.tsx`).

Stakeholders want **numeric custom time measurements** for:

1. Time from load start until the **first shape** is drawn on canvas.
2. Time from load start until the **initial full paint pass** (2D `renderScene` + `Mesh3DLayer.render` in the same frame), accepting image placeholders per product decision.

Measurements must be **once per `board_load_id`**, scoped to initial board load, and **abandoned** on failure or unmount without emitting partial durations.

## Evaluation Criteria

| Characteristic | Priority |
|---|---|
| Observability | Distinct metrics joinable to board-load funnel; no silent timer leaks |
| Testability | Deterministic unit tests; rAF hook testable without Coralogix |
| Maintainability | Single module owns load timing; `CanvasSurface` stays thin |
| Honest failure | Failed/abandoned loads do not emit misleading `_duration_ms` |
| API contract clarity | Journey semantics vs measurement semantics documented |

| Characteristic | A: Measurements only | B: Measurements + optional journey `lastWidgetVisible` (chosen) | C: Reuse journey events only (no measurements) |
|---|---|---|---|
| Observability | 4 | 5 | 3 |
| Dashboard parity (Miro-style) | 3 | 5 | 4 |
| Maintainability | 5 | 4 | 5 |
| Testability | 4 | 4 | 4 |
| **Total** | **16** | **18** | **16** |

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| A. `measurementService` only | Smallest change | Funnel queries lack milestone logs; harder workshop demos |
| B. Measurements + `lastWidgetVisible` journey | Aligns ADR-010 catalog extension; dual signal (log + numeric) | Two emission paths to keep in sync |
| C. Journey elapsed_ms only | No new Coralogix measure types | Weaker percentile tooling on `custom-measurement` |

## Decision

Adopt **Option B** with a dedicated module `boardShapeLoadTiming.ts` under `observability/rumJourney/` (or `observability/` if preferred — **must not** live in `CanvasSurface` inline).

### Measurement names (canonical)

| Internal timer key | RUM `rumStartTimeMeasure` / `rumEndTimeMeasure` name | Emitted custom measurement |
|---|---|---|
| `whiteboard_board_load_first_shape_visible` | same (sanitized unchanged) | `whiteboard_board_load_first_shape_visible_duration_ms` |
| `whiteboard_board_load_last_shape_visible` | same | `whiteboard_board_load_last_shape_visible_duration_ms` |

**Rationale**: `whiteboard_board_load_*` groups load metrics separately from interaction timers (`whiteboard_interaction_commit`) and matches existing `whiteboard_*` prefix. Shorter proposed names (`whiteboard_first_shape_visible`) are acceptable aliases in code constants but **dashboards should use the `board_load` segment** to avoid collision with future per-interaction “first shape” metrics.

Proposed names without `board_load` are **not recommended** — ambiguous in DataPrime next to shape-create counters.

### Semantic split (journey vs measurement)

| Signal | Trigger | Empty board (0 shapes) |
|---|---|---|
| `miro.board.load.firstWidgetVisible` (journey) | First rAF: `boardId` set, canvas layout &gt; 0, `renderScene` invoked | **Emits** (existing ADR-010) |
| `whiteboard_board_load_first_shape_visible` (measurement) | Same rAF, **`shapes.length > 0`**, no active `draft` | **Does not end** (abandon on cleanup) |
| `miro.board.load.lastWidgetVisible` (journey, new) | Same rAF as measurement “last”, once per load | **Does not emit** if 0 shapes |
| `whiteboard_board_load_last_shape_visible` (measurement) | After `renderScene` + `meshLayer.render` in same rAF, `shapes.length > 0`, no `draft` | **Does not end** if 0 shapes |

**Do not conflate** journey `firstWidgetVisible` with measurement “first shape” — workshop funnels use the former for “canvas ready”; SLO-style paint metrics use the latter.

### Hook points

| Phase | Location | Action |
|---|---|---|
| Start both timers | `WhiteboardPage.tsx` — immediately after `emitBoardLoadStarted(boardLoadId)` (same `load()` scope as `createBoardLoadContext`) | `startBoardShapeLoadTiming(boardLoadId)` |
| End first / last + optional journey | `CanvasSurface.tsx` — inside existing `requestAnimationFrame` callback, **after** `renderScene` and `meshLayerRef.current?.render(...)` | `onBoardShapePaintFrame({ shapes, boardLoadId, hasLayout })` |
| Abandon | `WhiteboardPage` effect cleanup; `emitBoardLoadFailed` path before return | `abandonBoardShapeLoadTiming(boardLoadId)` |
| Dedupe | `journeyContext.ts` | Add `markLastWidgetVisibleEmitted` mirroring `markFirstWidgetVisibleEmitted`; extend `clearBoardLoadContext` to reset last-shape flags |

**Guard conditions for end (all required)**:

- `getActiveBoardLoadContext()?.boardLoadId` matches
- `state.boardId` set
- Wrap/canvas `rect.width > 0 && rect.height > 0`
- `shapes.length > 0` (use same `shapes` array as render, **exclude `draft`**)
- Once-only flags per `board_load_id`

**Start alignment**: Timers start at **journey `started`**, not at API return — measures user-perceived load including network + hub unless explicitly changed later (document if shifting to post-API start).

### `measurementService` integration

- Use existing `startTimeMeasurement` / `endTimeMeasurement` — **do not** pass `board_load_id` as a measurement label; `sanitizeLabels` strips keys ending in `_id` (`measurements.ts`).
- Correlation to funnel: join on `boardId_hash` + `widgetCount` session labels (`rumBeforeSend`) and time proximity, or add **`board_load_correlation`** allowlist key in a follow-up ADR if strict join is required.
- Add **`abandonTimeMeasurement(name)`** (or `cancelTimeMeasurement`) on `MeasurementService` — delete timer without `rumEndTimeMeasure` / `_duration_ms` emit. Required for fail/unmount; otherwise Map entries leak and a later board reuse could end the wrong timer.

### Journey extension (optional but recommended)

```typescript
emitBoardLoadLastWidgetVisible(boardLoadId, widgetCount, elapsedMs)
// journey: miro.board.load.lastWidgetVisible
```

**Ordering invariant** (happy path, board with shapes):

`started` → `firstWidgetVisible` (may precede first-shape measurement on empty-first-paint edge) → `lastWidgetVisible` → `fullyInteractive` **or** `failed`.

Typical path when shapes exist before first paint: `started` → (first rAF) → `firstWidgetVisible` + first-shape measurement end + last-shape measurement end + `lastWidgetVisible` → hub → `fullyInteractive`.

### Cross-cutting enforcement layers

| Concern | Layers |
|---|---|
| Timer start/stop | `boardShapeLoadTiming.ts` → `measurementService` → `coralogixRum` |
| Journey milestones | `journeyEvents.ts` only |
| Load id lifecycle | `journeyContext.ts` |
| Session labels | `rumBeforeSend` / `rumLabelContext` (no `board_load_id` on measurements today) |
| Dedupe | `journeyContext` Sets per `board_load_id` |
| Abandon on S02 | `isScenarioActiveFlag('s02_abandon_load')` early return must call abandon |

## Implications

- **Positive**: Numeric p95/p99 for paint readiness; clear separation from hub `fullyInteractive`
- **Negative**: Two “first visible” concepts — documentation and dashboard naming discipline required
- **Risks / mitigations**:
  - **Image placeholders**: `renderScene` draws gray boxes for loading images; user accepts this for “last” — document in component contract; do not wait for `onImageLoad` for initial load metrics
  - **Extra rAFs**: `onImageLoad` bumps `renderTick` — dedupe prevents re-ending last/first; first end stays on first qualifying frame
  - **Draft shapes**: Exclude `draft` from `shapes` for load metrics to avoid false “first shape” during tool drag
  - **Empty boards**: Abandon timers on cleanup; journey `firstWidgetVisible` still fires
  - **Lag sim**: Large-board render cost inflates measurements — intentional (perf validation)
  - **Label stripping**: Cannot label measurements with `board_load_id` without service change

## Follow-up actions

1. Implement `boardShapeLoadTiming.ts` + `abandonTimeMeasurement`
2. Extend `journeyContext` + `journeyEvents` for `lastWidgetVisible`
3. Wire `WhiteboardPage` / `CanvasSurface` per hook table
4. Add tests listed in `components/board-shape-load-timing.md`
5. Amend `docs/canvas-perf-rum-validation.md` with DataPrime queries for new `_duration_ms` names

## Consultation

- Existing code: `measurements.ts`, `journeyEvents.ts`, `journeyContext.ts`, `CanvasSurface.tsx`, `WhiteboardPage.tsx`, ADR-010, `components/canvas-rum-journey-events.md`
