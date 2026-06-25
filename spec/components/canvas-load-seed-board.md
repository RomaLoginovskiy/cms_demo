# Canvas-Load Seed Board

**Parent:** [ADR-009](../adr/ADR-009-canvas-load-seed-board-admin.md)  
**Related:** [Whiteboard API](whiteboard-api.md), [Canvas Load Generator (browser)](canvas-load-generator-browser.md)

## Purpose

Idempotently provision board `loadgen-large` and create Sticky shapes via REST + SignalR so scenario `large_board` / S2 RUM validation has ≥1000 shapes (`text_editor.min_shapes` default 1000; operational target 1300).

## Module layout

| Path | Responsibility |
|------|----------------|
| `src/seed/types.ts` | `SeedOptions`, `SeedResult`, optional `SeedProgress` callback |
| `src/seed/stickyShape.ts` | `buildSticky(boardId, index)` — grid layout, same payload as today’s script |
| `src/seed/boardApi.ts` | `ensureBoard(baseUrl, name)`, `getShapeCount(baseUrl, boardId)` |
| `src/seed/seedBoard.ts` | Orchestration: skip if `existing >= target`, hub join, batched `CreateShape`, verify final count |
| `scripts/seed-large-board.mts` | CLI: argv → `seedBoard({ baseUrl, ... })` |
| `src/engine/boardProvision.ts` | `provisionBoardId` → `ensureBoard(config.target.frontend_base_url, name)` |
| `src/control/seedBoardRoute.ts` | Express route registration (optional split from `server.ts`) |

**Dependency rule:** `src/seed/*` must not import Playwright or `BrowserLoadEngine`.

## Public API — `seedBoard(options)`

```ts
interface SeedOptions {
  baseUrl: string;           // already resolved/coerced
  boardName?: string;        // default 'loadgen-large'
  targetCount?: number;      // default 1300
  batchSize?: number;        // default 25
  onProgress?: (p: { created: number; total: number }) => void;
}

interface SeedResult {
  boardId: string;
  boardName: string;
  existingCount: number;
  createdCount: number;
  finalCount: number;
  skipped: boolean;          // true when existing >= targetCount
  durationMs: number;
}
```

### REST (via nginx on canvas-frontend)

| Step | Method | Path | Success |
|------|--------|------|---------|
| List | GET | `/api/boards` | 200 → find by `name` |
| Create | POST | `/api/boards` | 201/200 body `{ id }` |
| Count | GET | `/api/boards/{id}` | 200 → `shapes.length` |

### SignalR

| Step | Hub method | Notes |
|------|------------|-------|
| Connect | `withUrl(`${baseUrl}/hubs/board`)` | Same origin as REST |
| Join | `JoinBoard(boardId, userId, 'Seeder', '#111827')` | Random `userId` (UUID) |
| Create | `CreateShape(boardId, shape)` | Parallel batch ≤ `batchSize`; Sticky only |
| Leave | `stop()` | After batch loop |

**Schema:** Sticky `ShapeDto` per [whiteboard-api.md](whiteboard-api.md); `geometryJson: null`, `type: 'Sticky'`. Contract test: freeze one `buildSticky` output JSON; reject if server adds required fields.

### Error modes

| Condition | Behavior |
|-----------|----------|
| List/create/get board non-2xx | Throw → control **500** `{ error: message }` |
| Hub start/invoke failure | Throw after partial creates; response should include `createdCount` if handler catches mid-flight |
| `existing >= targetCount` | **200** `{ skipped: true, ... }` — not an error |
| Unreachable frontend (probe failed) | **503** `{ error: 'frontend unreachable', ... }` |

## Control API — `POST /api/control/seed-board`

**Auth:** none (same as other `/api/control/*`).

**Request body** (all optional):

```json
{
  "board_name": "loadgen-large",
  "target_count": 1300,
  "batch_size": 25
}
```

Validation: `target_count` ∈ [1, 5000], `batch_size` ∈ [1, 100], `board_name` non-empty ≤ 128 chars.

**Target resolution:** Handler reads `engine.getConfig()`, applies `resolveTargetUrl(cfg).url` as `baseUrl`. **Ignores** client-supplied base URL in v1 (prevents localhost/cluster mismatch).

**Response 200:**

```json
{
  "boardId": "uuid",
  "boardName": "loadgen-large",
  "existingCount": 0,
  "createdCount": 1300,
  "finalCount": 1300,
  "skipped": false,
  "durationMs": 45200,
  "effectiveBaseUrl": "http://canvas-frontend"
}
```

**Response 503:** frontend probe failed. **Response 500:** seed/hub error.

**Concurrency:** Single-flight mutex in handler — second POST while seed running → **409** `{ error: 'seed already in progress' }`.

Optional **GET** `/api/control/seed-board/status` (v1.1): `{ inProgress, lastResult }` for page refresh mid-seed; not required if sync POST + UI spinner suffices.

### Composite: Prepare S2 (UI-only sequence)

No new endpoint required. Client order:

1. `POST /api/control/pause` (ignore error if already paused)
2. `POST /api/control/seed-board` (defaults)
3. `POST /api/control/scenario/large_board`
4. Display: “Seeded · large_board applied · click Resume”

Operator still applies `canvas-frontend` lag patch manually per runbook.

## Admin UI UX (`wwwroot`)

### Section: Board prep (S2)

Place after **Target**, before **Virtual users**.

| Control | Behavior |
|---------|----------|
| Status line `#seed-status` | Idle / “Seeding… created N/M” / “Done: 1300 shapes” / error text |
| **Seed loadgen-large (1300)** | `POST /api/control/seed-board`; disable during request; `fetch` no abort |
| **Large board** | `POST /api/control/scenario/large_board` (add `data-scenario` button) |
| **Prepare S2** | Chain pause → seed → large_board; confirm if `phase === running` |
| Hint text | “Pause load before seeding. Uses effective target from config.” |

Show `effective_frontend_base_url` in hint when it differs from input (reuse target-hint pattern).

### Scenario buttons

Add to existing scenario row:

```html
<button type="button" data-scenario="large_board">Large board</button>
```

Align `scenarioOverrides` keys with UI via future refactor (`GET /api/control/scenarios`); until then, manual sync when adding scenarios.

## Test strategy

| Layer | What | Command / location |
|-------|------|-------------------|
| **Unit** | `buildSticky` stable fields; `seedBoard` skip path with mocked `fetch` + hub | `tests/seed/seedBoard.test.ts` |
| **Unit** | `ensureBoard` create vs reuse | `tests/seed/boardApi.test.ts` |
| **Unit** | Handler validation + 409 mutex + uses `resolveTargetUrl` | `tests/control/seedBoardRoute.test.ts` with mock engine |
| **Integration** | Optional: hit local canvas stack | `@integration` tag, not default CI |
| **Contract** | Snapshot `buildSticky(…)` vs hub acceptance | one fixture in `tests/seed/fixtures/` |
| **E2E** | Playwright against `:8090` mock or stub hub | defer; manual S2 checklist in milestone |

**Regression from real failures:** When hub rejects payload, save response body into `tests/seed/fixtures/rejected-*.json` and add test.

## Files to touch

| File | Change |
|------|--------|
| `loadgen/canvas-load/src/seed/*.ts` | **New** shared module |
| `loadgen/canvas-load/scripts/seed-large-board.mts` | Thin CLI wrapper |
| `loadgen/canvas-load/src/engine/boardProvision.ts` | Delegate to `boardApi` |
| `loadgen/canvas-load/src/control/server.ts` | Register `POST /api/control/seed-board` (+ mutex state) |
| `loadgen/canvas-load/src/control/seedBoardRoute.ts` | **Optional** route module |
| `loadgen/canvas-load/wwwroot/index.html` | Board prep section + `large_board` button |
| `loadgen/canvas-load/wwwroot/app.js` | Seed/Prepare S2 handlers, status line |
| `loadgen/canvas-load/tests/seed/*.test.ts` | **New** unit tests |
| `loadgen/canvas-load/tests/control/seedBoardRoute.test.ts` | **New** |
| `spec/components/canvas-load-generator-browser.md` | Add `large_board` to scenarios list + seed endpoint (after impl) |
| `k8s/README.md` | Point S2 step 1 to admin UI seed button (keep CLI as alt) |

**Out of scope:** `canvas-frontend`, `RumDemoPanel`, new Deployment.

## Fitness functions

| ID | Criterion |
|----|-----------|
| SEED-01 | `seedBoard` with mocked API at target returns `skipped: true` when count ≥ target |
| SEED-02 | Control POST uses same `effectiveBaseUrl` as `GET /api/control/config` |
| SEED-03 | Re-post seed while in progress returns 409 |
| SEED-04 | After seed + `large_board` scenario, `boards.shared_board_name === 'loadgen-large'` in config snapshot |
