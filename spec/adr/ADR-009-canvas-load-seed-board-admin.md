# ADR-009: Seed Board via Canvas-Load Admin UI

**Status**: Proposed  
**Date**: 2026-05-29

## Context

Scenario **S2** (large-board text-edit perf / RUM) requires board `loadgen-large` with **≥1300** Sticky shapes before `large_board` loadgen runs. Today operators run a standalone CLI:

```bash
npm run seed-board -- --base-url http://<host> --count 1300 --board-name loadgen-large
```

which executes `scripts/seed-large-board.mts`. That script duplicates REST board provisioning already present in `src/engine/boardProvision.ts` (`provisionBoardId`). The `large_board` scenario exists in `scenarioOverrides` but is **not** exposed on the admin UI (`wwwroot/index.html` scenario row).

**Constraint (decided):** Seed control lives **only** on canvas-load admin UI (`:8090`, `loadgen/canvas-load/wwwroot`) — not on `RumDemoPanel` or canvas-frontend.

**Cross-cutting concern — target URL:** Playwright load and seeding must hit the **same effective** canvas-frontend base URL. In Kubernetes, `resolveTargetUrl` rewrites `localhost` → `http://canvas-frontend`. Seeding via a user-typed `localhost` while the engine uses the rewritten URL is a **Single-Knob Illusion** failure mode (seed succeeds against wrong host or fails while load “works”).

## Evaluation Criteria

| Characteristic | Priority | Question |
|----------------|----------|----------|
| **Maintainability** | High | One implementation for CLI + control API + future automation? |
| **Testability** | High | Can seed logic be unit-tested without Playwright? |
| **Deployability** | Medium | No new pods; reuse canvas-load control server |
| **Observability** | Medium | Operator sees progress and final shape count in UI |
| **Fault-tolerance** | Medium | Idempotent re-run; honest errors when hub/API down |
| **Security** | Low | Internal admin only; no auth on control plane today |

### Options scored (1–5, 5 = best)

| Characteristic | A: Shared module + control POST | B: UI shells out to CLI (`exec`) | C: Keep CLI only, document in README |
|---|---|---|---|
| Maintainability | 5 | 2 | 3 |
| Testability | 5 | 1 | 3 |
| Deployability | 5 | 3 | 5 |
| Observability | 4 | 2 | 1 |
| **Total** | **19** | **8** | **12** |

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **A — Shared `seedBoard()` module** | DRY with CLI; testable; uses `resolveTargetUrl` | ~200 LOC move/refactor |
| **B — `exec` npm script from control server** | Minimal refactor | Fragile in Docker image; poor progress API; duplicate env |
| **C — CLI only** | Zero code | S2 prep stays manual; `large_board` still hidden in UI |

## Decision

**Option A:** Extract a shared seed module under `loadgen/canvas-load/src/seed/`, thin CLI wrapper, and **`POST /api/control/seed-board`** on the existing control server. Admin UI adds a **Board prep (S2)** section with seed status, `large_board` scenario button, and optional **Prepare S2** composite action.

### Target URL enforcement (all layers)

| Layer | Enforcement |
|-------|-------------|
| UI | Shows `effective_frontend_base_url` from `GET /api/control/config`; seed uses engine config, not a separate URL field |
| Control handler | `resolveTargetUrl(engine.getConfig())` → `baseUrl` for REST + hub |
| CLI | `coerceTargetUrl` / same `resolveTargetUrl` when `--base-url` passed; document that in-cluster jobs should pass service DNS or rely on defaults |
| Load engine | Existing `applyResolvedTarget` on start/resume |

If `frontendReachable === false`, seed returns **503** with explicit message (do not silently no-op).

### Seeding vs load concurrency

Recommend **pause** load before seed (UI hint). Handler does not auto-pause; composite **Prepare S2** may call `pause` first when `phase === running`. Parallel SignalR `CreateShape` from seeder + many VUs is acceptable but noisy for S2 baseline — operator workflow assumes seed **then** resume `large_board`.

### API shape

Synchronous **POST** for v1 (1300 shapes ≈ 30–90s). Response includes `durationMs`, counts, `skipped` if already at target. No job queue in v1; if browser/proxy timeouts appear in prod, add `202` + poll in a follow-up ADR.

### Module structure

```
loadgen/canvas-load/src/seed/
  types.ts           # SeedOptions, SeedResult, SeedProgress
  stickyShape.ts     # buildSticky(boardId, index)
  boardApi.ts        # ensureBoard, getShapeCount (REST)
  seedBoard.ts       # seedBoard(options): idempotent REST + SignalR batches
scripts/seed-large-board.mts   # parseArgs → seedBoard() → console progress
src/engine/boardProvision.ts   # provisionBoardId → delegate to boardApi.ensureBoard
src/control/seedBoardRoute.ts  # optional: register route + validation (keeps server.ts thin)
```

`boardApi.ensureBoard` replaces duplicated logic in script and `provisionBoardId`.

### UI (summary)

New section **Board prep (S2)** between Target and Virtual users:

- **Seed loadgen-large (1300)** — primary button; disabled while `seedInProgress`; shows last result line
- **Large board scenario** — `data-scenario="large_board"` alongside existing scenario buttons
- **Prepare S2** (optional composite): `pause` → `seed-board` (default body) → `scenario/large_board` → show “Resume when ready” (does **not** auto-resume — avoids surprise load during patch/validation)

Defaults: `boardName=loadgen-large`, `targetCount=1300`, `batchSize=25`.

### One-click S2?

**Yes, as “Prepare S2”** (seed + scenario + pause), **not** full run (no auto-resume). Full one-click including resume is rejected: conflicts with Coralogix pre-flight and optional `canvas-frontend` lag patch steps in [k8s/README.md](../../k8s/README.md).

## Implications

- **Positive:** Operators complete S2 prep from `:8090` without `kubectl exec` / local npm; CLI unchanged for CI/scripts.
- **Negative:** Long-running HTTP request; UI must disable double-submit and show spinner.
- **Risks:** Hub/API overload if seed during heavy load — mitigated by pause hint and composite pause-first.
- **Follow-up:** Async seed job + `GET /api/control/seed-board/status` if sync timeouts; export scenario list from `scenarioOverrides` keys to avoid HTML drift.

## Consultation

Product constraint: canvas-load admin UI only (user). Existing S2 docs: `k8s/README.md`, `spec/adr/ADR-004-canvas-lag-simulation.md`.
