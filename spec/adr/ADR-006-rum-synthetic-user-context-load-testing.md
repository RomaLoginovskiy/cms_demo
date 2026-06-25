# ADR-006: Synthetic RUM User Context for Canvas Load Testing

**Status**: Proposed  
**Date**: 2026-05-29

## Context

Canvas load testing (`loadgen/canvas-load`) already assigns per-virtual-user RUM session dimensions (`plan`, `v`, `scenario`, geo/UA) via URL query built in `buildRumQuery.ts` / `rumSessionPlan.ts`. The canvas frontend initializes Coralogix RUM in `coralogixRum.ts` with init labels and `beforeSend` enrichment but does **not** call `CoralogixRum.setUserContext`.

Workshop and DataPrime queries need **distinct synthetic users** (id, name, email, metadata such as `role`) correlated with plan/scenario cohorts—not only session labels. Whiteboard `identity.ts` stores a separate collaboration persona in `localStorage` and is not wired to RUM; Playwright isolates storage per context but identity is not deterministic from `userIndex` and lacks email/role.

## Evaluation Criteria

| Characteristic | Priority |
|---|---|
| Observability | Filter RUM by `user_id` / `user_metadata.role` alongside existing labels |
| Testability | Deterministic per `seed + userIndex`; unit-testable URL contract |
| Safety | No real PII; demo gate unchanged; user fields stripped from RUM page URLs |
| Maintainability | Reuse existing URL → `RumSessionConfig` → init pipeline |
| Deployability | Loadgen-only change insufficient without FE SDK call |

| Characteristic | A. Loadgen + URL, FE applies | B. Frontend-only random | C. Wire `identity.ts` to RUM |
|---|---|---|---|
| Observability | 5 | 3 | 3 |
| Testability | 5 | 4 | 2 |
| Maintainability | 4 | 5 | 2 |
| Load-test correlation | 5 | 2 | 2 |
| **Total** | **19** | **14** | **9** |

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| A. **Hybrid: loadgen assigns, frontend applies** (chosen) | Matches ADR-005 URL contract; deterministic matrix; single SDK call site | Two repos touch; URL length growth |
| B. Frontend-only random when `rumDemo=1` | Smallest diff | Breaks loadgen↔user cohort correlation; manual panel hard to reproduce |
| C. `localStorage` / `identity.ts` | Realistic display names | Nondeterministic across reruns; late timing; no email/role today |

## Decision

Adopt **Option A (hybrid)**:

1. **Loadgen** extends `RumSessionAssignment` with a synthetic user profile generated deterministically from `config.run.seed + userIndex` (use existing `_rng` in `resolveRumSessionForUser`). **Every virtual user** gets a synthetic profile, not only `rum_batch` sessions.
2. **Transport** adds a single compact query param `rum_user` (base64url JSON) to `buildRumQuery` output—avoid four separate PII-like params and keep workshop URLs copyable.
3. **Frontend** parses `rum_user` into `RumSessionConfig.rumUserContext` and calls `CoralogixRum.setUserContext(...)` **once**, immediately after successful `CoralogixRum.init()`, only when `demoEnabled` (same gate family as scenario injectors per ADR-005).
4. **Do not** wire `whiteboard.identity` in v1; optional follow-up if collaborative demos need matching hub display name and RUM user.

### Cross-cutting enforcement layers

| Layer | Responsibility |
|---|---|
| Loadgen `VirtualBrowserUser.start` | Generate synthetic user for every VU; embed in `rum_user` on all navigations |
| URL `rum_user` | Carry profile for this navigation session |
| `parseRumSessionConfig` | Decode + validate; ignore malformed (warn once) |
| `initializeCoralogixRum` | `setUserContext` after `init` if `rumUserContext` present |
| `urlBlueprinters` (existing) | Strip query string from page/network URLs in RUM payloads |
| `isRumDemoInjectorsAllowed` | Scenario injectors only — **not** used for `setUserContext` |
| Loadgen gate | `user_metadata.loadgen=1` + production requires `RUM_DEMO_ALLOW_PROD` |

Misconfiguration: invalid `rum_user` → `console.warn` + skip user context; RUM still initializes (honest degradation, not silent fake users).

### `rum_user` payload schema (v1)

```typescript
interface RumUserPayload {
  user_id: string;       // required, max 128 chars
  user_name?: string;    // max 128
  user_email?: string;   // max 256; must use @rum-demo.invalid suffix in loadgen
  user_metadata?: Record<string, string | number | boolean>;
}
```

**Loadgen conventions** (deterministic, not crypto-random):

| Field | Rule |
|---|---|
| `user_id` | `load-${userIndex}-${shortHash(seed,userIndex)}` |
| `user_name` | Pick from fixed pool via rng |
| `user_email` | `loaduser-${userIndex}@rum-demo.invalid` |
| `user_metadata.role` | `viewer` \| `editor` \| `admin` from rng |
| `user_metadata.plan` | Echo assignment `plan` |
| `user_metadata.scenario` | Echo assignment `scenario` |
| `user_metadata.loadgen` | `"1"` when from loadgen |

Unknown JSON keys in payload: **ignored** (forward-compatible). Missing `user_id`: reject payload.

### Timing

```
parseRumSessionConfig() → initializeCoralogixRum()
  → CoralogixRum.init(...)
  → CoralogixRum.setUserContext(...)   // if rumUserContext
  → return
activateScenario()                     // unchanged order in index.tsx
```

`setUserContext` must run **after** `init` and **before** `activateScenario` so scenario-generated errors/logs include user context.

### Out of scope (v1)

- Mid-session user switches (panel “impersonate”) — defer
- CMS `frontend/` RUM — canvas-only unless explicitly requested
- Backend persistence of demo users

## Implications

- **Positive**: DataPrime can segment `plan=enterprise` errors by `user_metadata.role=admin`; UC2 plan mix visible per synthetic user.
- **Negative / Risks**: URL length (~200–400 bytes); mitigated by single `rum_user` param. If `rum_user` omitted, behavior unchanged.
- **Follow-up**: Document DataPrime filter examples in `docs/canvas-perf-rum-validation.md`; optional v2 sync with `getOrCreateIdentity()` for manual demos only.

## Consultation

ADR-005 (RUM demo scenarios), `canvas-rum-loadgen-extension` contract, `coralogixRum.ts`, `rumSessionPlan.ts`, Coralogix Browser SDK `setUserContext` (@coralogix/browser ^3.9.0).
