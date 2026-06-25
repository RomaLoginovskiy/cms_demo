# Canvas RUM Loadgen Extension (Component Contract)

## Purpose

Extend `loadgen/canvas-load` so each Playwright session carries an explicit **RUM demo plan** (`plan`, `v`, `scenario`, geo/UA) via URL query string—enabling UC1 scale (50+ sessions) without duplicating scenario logic outside the browser.

## Public interface

```typescript
// loadgen/canvas-load/src/rum/rumSessionPlan.ts

interface RumSessionAssignment {
  plan: 'free' | 'enterprise' | 'team';
  version: string;
  scenario: string;       // s01..s14
  featureArea?: string;
  releaseRing?: string;
  demoGeo?: string;
  demoBrowserFamily?: string;
  rumDemo?: boolean;      // default true when rum_batch.enabled
  rumUser?: RumSyntheticUser;  // ADR-006; encoded as rum_user query param
}

function resolveRumSessionForUser(
  config: LoadConfig,
  userIndex: number,
  rng: Rng
): RumSessionAssignment;

function buildRumQuery(assignment: RumSessionAssignment): string;
```

**Config** (`LoadConfig.rum_batch`):

| Field | Type | Description |
|---|---|---|
| `enabled` | boolean | Master switch |
| `preset` | string | `uc1_critical_spike`, `uc2_plan_mix`, `uc4_version_ab` |
| `matrix` | array | Explicit `{ plan, v, scenario, count }` rows |
| `append_to_all_navigations` | boolean | Default true |

**Presets**

| Preset | Matrix |
|---|---|
| `uc1_critical_spike` | 50× `s01`, mixed `demo_geo` / UA families |
| `uc2_plan_mix` | 40× `s04` `plan=free`, 10× `s05` `plan=enterprise`; per-row `demo_geo` / UA via fingerprint resolver |
| `uc4_version_ab` | 25× `v=1.92903` `s09`, 25× `v=1.95821` `s09`; per-row `demo_geo` / UA via fingerprint resolver |

## Synthetic user context (ADR-006)

When `rum_batch.enabled`, each assignment includes a **deterministic synthetic user** (`buildRumSyntheticUser` using `seed + userIndex`). `buildRumQuery` appends `rum_user=<base64url(JSON)>` alongside existing params. Frontend calls `CoralogixRum.setUserContext` after init. See [canvas-rum-user-context.md](./canvas-rum-user-context.md).

## Behavior changes

| Component | Change |
|---|---|
| `rumSessionPlan.ts` | Generate `rumUser` via rng; pass to assignment |
| `buildRumQuery.ts` | Append `rum_user` when `assignment.rumUser` set |
| `VirtualBrowserUser.start` | Optional `geolocation`, `locale`, `userAgent` from assignment |
| `boardSession.openBoardSession` | `goto` URL includes `buildRumQuery(assignment)` |
| `BoardListPage` | `openBoardById(id, querySuffix?)` |
| `BrowserLoadEngine` | `applyRumScenario`, `applyRumBatchPreset`, `restartVirtualUsersForRum` |
| `control/server.ts` | `GET /api/control/rum/scenarios`, `POST /api/control/rum/scenario/:id`, `POST /api/control/rum/batch/:preset` |
| `wwwroot/` | RUM demo panel (s01–s14 + batch presets) |
| `prometheus.ts` | `canvas_load_rum_sessions_total` |

## Dependencies

- FE contract: [canvas-rum-demo-scenarios.md](./canvas-rum-demo-scenarios.md) query params
- Existing `resolveTargetUrl`, `userIndex`, `seed` for deterministic sharding

## Error modes

- `rum_batch.enabled` but empty matrix → startup validation error (fail fast)
- Unknown `scenario` in YAML → fail at config load
- FE ignores unknown scenario → session still runs but panel warns (loadgen should only use registry ids)

## Session pacing (ADR-007)

For RUM replay length, optional `users.session_pacing` bounds each `runProfile` slice and slows think time for a fraction of VUs. Implemented in `VirtualBrowserUser` + `sessionPacing.ts` — see [canvas-load-session-pacing.md](./canvas-load-session-pacing.md). **Do not** restart `BrowserContext` to extend sessions.

## Fitness functions

1. `npm test` in `loadgen/canvas-load` includes `buildRumQuery` snapshot tests.
2. Dry-run logs first 3 users’ full URLs containing `rumDemo=1&scenario=`.
3. UC1 workshop: 50 parallel users produce ≥ 50 distinct RUM session ids for `s01` in DataPrime within 10 minutes.
4. With `session_pacing.enabled` and `rum-batch` 15m run, ≥20% of sessions exceed 8m wall-clock before engine stop (after FE `sessionRecording` enabled).
