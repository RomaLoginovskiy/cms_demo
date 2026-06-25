# Board Shape Load Timing (Component Contract)

## Purpose

Own **initial board load** Coralogix RUM custom time measurements for first/last shape paint, coordinating with `rumJourney` board-load context. Keeps `CanvasSurface` and `WhiteboardPage` free of timer/dedupe logic.

## Module

```
canvas-frontend/src/observability/rumJourney/boardShapeLoadTiming.ts
```

## Public API

```typescript
const FIRST_SHAPE_MEASURE = 'whiteboard_board_load_first_shape_visible';
const LAST_SHAPE_MEASURE = 'whiteboard_board_load_last_shape_visible';

/** Start both timers once per board load. Idempotent per boardLoadId. */
export function startBoardShapeLoadTiming(boardLoadId: string): void;

/**
 * Called from CanvasSurface rAF after renderScene + Mesh3D render.
 * Ends measurements and may emit journey lastWidgetVisible when guards pass.
 */
export function onBoardShapePaintFrame(params: {
  boardLoadId: string;
  shapeCount: number;
  hasLayout: boolean;
}): void;

/** Drop timers without emitting duration (fail, unmount, navigation). */
export function abandonBoardShapeLoadTiming(boardLoadId: string): void;

export function resetBoardShapeLoadTimingForTests(): void;
```

## Dependencies

| Caller | Calls |
|---|---|
| `WhiteboardPage.tsx` | `startBoardShapeLoadTiming` after `emitBoardLoadStarted`; `abandonBoardShapeLoadTiming` on cleanup and on `emitBoardLoadFailed` |
| `CanvasSurface.tsx` | `onBoardShapePaintFrame` inside existing rAF (replace inline first-widget journey block or delegate to this module) |
| `measurementService` | start / end / abandon |
| `journeyContext` | `getActiveBoardLoadContext`, dedupe flags |
| `journeyEvents` | `emitBoardLoadLastWidgetVisible` (new), existing `emitBoardLoadFirstWidgetVisible` may move here for cohesion |

## Data contracts

### Custom measurements (via `measurementService`)

| Name | Start | End |
|---|---|---|
| `whiteboard_board_load_first_shape_visible` | `startBoardShapeLoadTiming` | First qualifying paint frame |
| `whiteboard_board_load_last_shape_visible` | same | Same frame as first end (after Mesh3D), or later frame if first-only not yet met — **last** always ends on first frame where `shapeCount > 0` and full pass complete |

Emitted suffix: `*_duration_ms` (number). Labels: use `shape_count` bucket string only if needed — **not** `board_load_id`.

### Journey (optional)

| Event | When |
|---|---|
| `miro.board.load.lastWidgetVisible` | Same instant as `endTimeMeasurement(LAST_SHAPE_MEASURE)` | `widget_count`, `elapsed_ms` |

Existing `miro.board.load.firstWidgetVisible` remains **first paint with layout**, not gated on `shapeCount` (see ADR-012).

## Paint frame qualification

All must be true to end timers / emit `lastWidgetVisible`:

1. Active `boardLoadId` matches `getActiveBoardLoadContext()`
2. `hasLayout === true` (width/height &gt; 0)
3. `shapeCount > 0`
4. Caller excluded `draft` from shape list
5. `renderScene` and `Mesh3DLayer.render` already ran in this rAF
6. Dedupe flags not already set for this milestone

**First shape** ends on first qualifying frame. **Last shape** ends on **first** qualifying frame (not “all images decoded”) — placeholders OK.

## Error modes

| Scenario | Behavior |
|---|---|
| API/hub failure | `abandonBoardShapeLoadTiming` — no `_duration_ms` |
| Unmount / navigate away | abandon in effect cleanup |
| Empty board | never end; abandon on cleanup |
| `s02_abandon_load` early return | abandon before leaving page |
| `endTimeMeasurement` without start | no-op (existing service behavior) |
| Second `start` same names | overwrites timer — **prevent** by idempotent start per `boardLoadId` |

## Fitness functions

| Function | Command |
|---|---|
| Module unit tests | `npm test -- --testPathPattern=boardShapeLoadTiming` |
| Journey dedupe | `npm test -- --testPathPattern=journeyContext` |
| No timer leak on abandon | test asserts `measurementService` internal map empty after abandon |
| Regression | `npm test -- --testPathPattern='rumJourney|measurements'` |

## Test list (implementation gate)

| Test file | Case |
|---|---|
| `boardShapeLoadTiming.test.ts` | start → paint frame → both `endTimeMeasurement` called once |
| `boardShapeLoadTiming.test.ts` | `shapeCount === 0` → no end |
| `boardShapeLoadTiming.test.ts` | second paint frame → no duplicate end |
| `boardShapeLoadTiming.test.ts` | abandon → no `rumEndTimeMeasure`, map cleared |
| `boardShapeLoadTiming.test.ts` | wrong `boardLoadId` → no end |
| `journeyEvents.test.ts` | `emitBoardLoadLastWidgetVisible` golden payload |
| `journeyContext.test.ts` | `markLastWidgetVisibleEmitted` once per id |
| `CanvasSurface` (component) | mock rAF: with shapes, timings end once; journey + measurements |
| `WhiteboardPage` (integration) | failed load: abandon, no duration measurement |

## Alignment with existing patterns

| Pattern | Alignment |
|---|---|
| `measurementService` | Same start/end as `whiteboardCommit` / `boardHubClient` |
| `rumJourney` | Same `board_load_id` in journey labels only; dedupe in `journeyContext` |
| `CanvasSurface` rAF | **Confirmed** hook point — already used for `firstWidgetVisible` |
| `WhiteboardPage` load | **Confirmed** start at `emitBoardLoadStarted` |

## Related spec

- [ADR-012: Board Shape Load RUM Timing](../adr/ADR-012-board-shape-load-rum-timing.md)
- [Canvas RUM Journey Events](./canvas-rum-journey-events.md)
- [Canvas perf RUM validation](../../docs/canvas-perf-rum-validation.md)
