# ADR-008: Standard Coralogix RUM Session Labels for Canvas Load Testing

**Status**: Proposed  
**Date**: 2026-05-29

## Context

Workshop and DataPrime queries for canvas load testing need **ten stable RUM event labels** on every Coralogix Browser SDK event emitted during Playwright-driven sessions (`loadgen/canvas-load` → `canvas-frontend`).

**Target labels**: `plan`, `userRole`, `feature_area`, `releaseRing`, `boardId_hash`, `widgetCount`, `isCollaborativeSession`, `integrationContext`, `network_effective_type`, `memoryUsage_mb`.

**Current state** (verified in code):

| Label | Status | Mechanism today |
|---|---|---|
| `plan` | On events | URL → `RumSessionConfig` → `beforeSend` |
| `feature_area` | On events | URL → `RumSessionConfig` → `beforeSend` |
| `releaseRing` | On events | URL → `RumSessionConfig` → `beforeSend` |
| `widgetCount` | On events | URL seed optional; live count via `setWidgetCount` in `WhiteboardPage` |
| `userRole` | **Not on events** | Only `user_metadata.role` via `rum_user` → `setUserContext` |
| `boardId_hash` | Missing | — |
| `isCollaborativeSession` | Missing | Hub presence exists but not wired to RUM |
| `integrationContext` | Missing | — |
| `network_effective_type` | Missing | — |
| `memoryUsage_mb` | Missing | — |

**Pipeline** (unchanged architecture): `parseRumSessionConfig` → `initRumLabelContext` → runtime mutators → `getRumLabelSnapshot` → `enrichSessionLabels` in `rumBeforeSend` → `event.labels`.

Coralogix SDK labels are `Record<string, string>`. Booleans and numbers **must be string-coerced** at the label boundary (`"true"` / `"false"`, integer strings for counts).

**Enum divergence vs product (Miro-style) spec**:

| Dimension | Codebase (demo) | Product spec |
|---|---|---|
| `plan` | `free` \| `enterprise` \| `team` | `free` \| `starter` \| `business` \| `enterprise` |
| `userRole` | `viewer` \| `editor` \| `admin` | `owner` \| `editor` \| `commenter` \| `viewer` |
| `releaseRing` | `stable` \| `canary` \| `internal` | `canary` \| `ga` \| `enterprise-locked` |

Changing emitted values breaks existing ADR-005 dashboards and `buildRumQuery` snapshots. Product alignment is a **separate optional layer**, not a silent rename.

## Evaluation Criteria

| Characteristic | Priority |
|---|---|
| Observability | All 10 labels filterable in DataPrime on loadgen sessions |
| Testability | Deterministic URL-sourced dims; runtime dims unit-testable without Playwright |
| Maintainability | Single snapshot + beforeSend merge; no per-scenario label duplication |
| Security | No raw `boardId` in RUM; hash only |
| Deployability | FE-only deploy insufficient for cohort dims; loadgen must set URL params |

| Characteristic | A. All via URL | B. Hybrid URL + runtime (chosen) | C. Runtime-only |
|---|---|---|---|
| Observability | 4 | 5 | 3 |
| Testability | 3 | 5 | 4 |
| Security (board id) | 2 | 5 | 5 |
| Loadgen cohort control | 5 | 5 | 2 |
| Fidelity (network/memory) | 2 | 5 | 5 |
| **Total** | **16** | **25** | **19** |

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| A. Loadgen sets all 10 via URL | Full cohort control in YAML | Cannot truthfully set live widget count, memory, or real collaboration; board id leakage risk |
| B. **Hybrid: URL for cohort dims, FE for session truth** | Matches existing ADR-005/006 pattern; honest runtime signals | Two touch points; requires clear ownership table |
| C. FE derives everything | Smallest loadgen diff | Breaks deterministic plan/role/integration cohorts |

## Decision

Adopt **Option B (hybrid)**. Extend the existing label pipeline; do **not** add parallel label injection in scenario modules or loadgen Playwright scripts.

### Label ownership matrix

| Label | Set by loadgen (URL / `rum_user`) | Derived by frontend at runtime | Default when absent |
|---|---|---|---|
| `plan` | **Yes** — `plan` query param | Re-parse on navigation | `free` |
| `userRole` | **Yes** — `rum_user.user_metadata.role` | Promote to event label in `beforeSend` | `viewer` |
| `feature_area` | **Yes** — `feature_area` / `area` | Re-parse on navigation | `board` |
| `releaseRing` | **Yes** — `ring` / `releaseRing` | Re-parse on navigation | `stable` |
| `boardId_hash` | No | **Yes** — hash on board load (`WhiteboardPage`) | `""` (omit from event) |
| `widgetCount` | Optional seed — `widgetCount` param | **Yes** — `setWidgetCount(store.shapes.length)` | `"0"` |
| `isCollaborativeSession` | Optional override — `collab=1\|0` (test only) | **Yes** — `presence.length >= 2` after hub connect | `"false"` |
| `integrationContext` | **Yes** — `integration_context` param from behavior profile | Optional augment if CMS API used | `whiteboard_only` |
| `network_effective_type` | No | **Yes** — `navigator.connection.effectiveType` | `unknown` |
| `memoryUsage_mb` | No | **Yes** — sampled `performance.memory.usedJSHeapSize` | `""` until first sample |

**Rule**: loadgen controls **cohort dimensions** (who/what/when in the test matrix). Frontend controls **session truth** (board size, collaboration, browser resource state).

### Enum policy (demo vs product)

**Phase 1 (this ADR)**: Keep demo enum values already in `rumSessionConfig.ts` and `rumSyntheticUser.ts`. Document product mapping for dashboard authors; do **not** silently remap.

**Phase 2 (deferred, optional)**: Add URL flag `label_schema=product` that applies alias map at parse time only:

| Demo value | Product alias |
|---|---|
| `team` | `starter` |
| `enterprise` | `enterprise` |
| `free` | `free` |
| `admin` | `owner` |
| `viewer` | `viewer` |
| `editor` | `editor` |
| `stable` | `ga` |
| `canary` | `canary` |
| `internal` | `enterprise-locked` |

No `commenter` or `business` in demo taxonomy today; add to loadgen rng only when Phase 2 is requested.

### Cross-cutting enforcement layers

| Concern | Layers |
|---|---|
| URL cohort labels | loadgen `buildRumQuery` → FE `parseRumSessionConfig` → `initRumLabelContext` |
| `userRole` event label | loadgen `rum_user` → FE `parseRumUserParam` → **`beforeSend` copies `user_metadata.role`** (not only `setUserContext`) |
| Runtime labels | FE mutators in `rumLabelContext` + sampler → `getRumLabelSnapshot` → `beforeSend` |
| Prod safety | Unchanged: demo gate for injectors; runtime labels are passive reads (no fault injection) |
| PII | `boardId_hash` = first 12 hex chars of SHA-256(boardId); never emit raw id. URL redaction unchanged. |
| Type coercion | All snapshot fields typed `string`; bool → `"true"`\|`"false"`, numbers → `String(Math.round(...))` |

Misconfiguration: invalid URL enum → existing parse fallbacks (`free`, `stable`); warn in dev panel only. Missing runtime signal → omit label or send documented default; **never** invent synthetic memory/network values in loadgen.

### `boardId_hash` algorithm

```
boardId_hash = sha256(utf8(boardId)).slice(0, 12)   // lowercase hex, no prefix
```

Use Web Crypto in browser; sync fallback for Jest via Node `crypto.subtle` mock. Empty when not on a board route.

### `integrationContext` loadgen conventions

| Behavior profile | Suggested value |
|---|---|
| `lurker`, `active_drawer`, `text_editor`, `collaborator`, `complex_placer` | `whiteboard_only` |
| `media_placer` | `cms_media` |
| `admin` | `admin_api` |
| RUM batch matrix override | YAML `integrationContext` per row |

Loadgen sets `integration_context=<value>` on every navigation query string when profile is known at `VirtualBrowserUser.start`.

### Runtime sampling

- **`network_effective_type`**: read on each `beforeSend` (cheap) or refresh every 30s in label context.
- **`memoryUsage_mb`**: refresh every 5s via `setInterval` after RUM init; Chrome-only API — emit `unknown` when `performance.memory` absent (Firefox/Safari loadgen still gets other labels).

### Implementation phases

1. **Plumbing** — extend `RumLabelSnapshot`, `enrichSessionLabels`, tests for all 10 keys.
2. **userRole promotion** — extract role from `sessionConfig.rumUserContext` in snapshot builder.
3. **Runtime board/collab/widget** — wire `WhiteboardPage` + presence subscription.
4. **Runtime browser metrics** — small `rumRuntimeMetrics.ts` sampler started from `initializeCoralogixRum`.
5. **Loadgen** — `integration_context` in `buildRumQuery`; map profile → context in `VirtualBrowserUser`.
6. **Fitness** — unit tests + loadgen snapshot test listing all 10 labels.

## Implications

- **Positive**: Single DataPrime filter surface for UC1–UC4; collaboration and board-size regressions visible without joining logs.
- **Negative / Risks**: Label cardinality from `boardId_hash` — acceptable for demo boards; monitor if hash bucket count explodes. `memoryUsage_mb` sparse on non-Chromium browsers.
- **Follow-up**: Phase 2 product enum aliases; document DataPrime examples in `docs/canvas-perf-rum-validation.md`.

## Consultation

ADR-005 (RUM scenarios), ADR-006 (synthetic user), `rumLabelContext.ts`, `rumBeforeSend.ts`, `buildRumQuery.ts`, `VirtualBrowserUser.ts`, Coralogix Browser SDK label typing.
