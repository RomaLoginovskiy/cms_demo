# Canvas RUM Synthetic User Context (Component Contract)

## Purpose

Attach **deterministic synthetic Coralogix RUM user context** to canvas load-test sessions so DataPrime can filter by `user_id`, `user_name`, `user_email`, and `user_metadata` (e.g. `role`) in addition to existing session labels (`plan`, `rum_scenario`, etc.).

## Public interface

### Loadgen (`loadgen/canvas-load`)

```typescript
// rumSyntheticUser.ts (new)
interface RumSyntheticUser {
  user_id: string;
  user_name: string;
  user_email: string;
  user_metadata: {
    role: 'viewer' | 'editor' | 'admin';
    plan: string;
    scenario: string;
    loadgen: '1';
  };
}

function buildRumSyntheticUser(
  assignment: Pick<RumSessionAssignment, 'plan' | 'scenario'>,
  userIndex: number,
  rng: () => number
): RumSyntheticUser;

function encodeRumUserParam(user: RumSyntheticUser): string; // base64url(JSON)

// buildRumQuery.ts — append when user present
// params.set('rum_user', encodeRumUserParam(user));
```

`resolveRumSessionForUser` calls `buildRumSyntheticUser` when `rum_batch` matrix is active (for plan/scenario echo). **`VirtualBrowserUser.start`** always builds a synthetic user and appends `rum_user` to every navigation query string.

### Frontend (`canvas-frontend`)

```typescript
// rumSessionConfig.ts
interface RumUserContext {
  user_id: string;
  user_name?: string;
  user_email?: string;
  user_metadata?: Record<string, string | number | boolean>;
}

interface RumSessionConfig {
  // ...existing fields
  rumUserContext?: RumUserContext;
}

function parseRumUserParam(encoded: string | null): RumUserContext | undefined;

// coralogixRum.ts
function applyRumUserContext(context: RumUserContext): void;
// Called from initializeCoralogixRum after CoralogixRum.init
```

**SDK mapping** (Coralogix Browser):

```typescript
CoralogixRum.setUserContext({
  user_id: context.user_id,
  user_name: context.user_name,
  user_email: context.user_email,
  user_metadata: context.user_metadata
});
```

## Data contract

| Mechanism | Use | Notes |
|---|---|---|
| **URL `rum_user`** | **Canonical for loadgen** | base64url(JSON) per ADR-006; set on **every** loadgen navigation via `appendRumQuery` |
| `localStorage` (`whiteboard.identity`) | **Not used v1** | Different lifecycle; defer optional manual-demo bridge |
| Init options | **N/A** | SDK has no init-time user block; use `setUserContext` post-init |
| Panel overrides | **Out of scope v1** | Could extend `rum_demo_overrides` later |

### Query param

| Param | Type | Required | Example |
|---|---|---|---|
| `rum_user` | base64url UTF-8 JSON | No | see ADR-006 schema |

Coexists with existing params: `rumDemo=1&plan=enterprise&scenario=s05&rum_user=...`

## Error modes

| Condition | Behavior |
|---|---|
| Missing `rum_user` | No `setUserContext`; labels-only session |
| Invalid base64 / JSON | `console.warn`; skip user context |
| Missing `user_id` in JSON | Skip user context |
| RUM init failed (no public key) | Skip `setUserContext` |
| Missing `loadgen` marker in metadata | Skip `setUserContext` |
| Production without `allowProd` | Skip `setUserContext` |

## Dependencies

- Upstream: [canvas-rum-loadgen-extension.md](./canvas-rum-loadgen-extension.md), ADR-006
- Downstream: Coralogix DataPrime (`$d.cx_rum.user_context` / equivalent product fields)
- Independent of: `whiteboard-api`, hub identity

## Fitness functions

1. `npm test` in `loadgen/canvas-load`: `buildRumQuery` output includes decodable `rum_user` with stable snapshot for fixed seed+userIndex.
2. `npm test` in `canvas-frontend`: `parseRumUserParam` + mock `setUserContext` called once after init when `rumDemo=1`.
3. Workshop: UC2 preset yields ≥2 distinct `user_id` values per plan cohort in RUM within 10 minutes.

## Test strategy (summary)

| Layer | Tests |
|---|---|
| Loadgen unit | `encodeRumUserParam` round-trip; deterministic user for seed+index; query string length bounds |
| FE unit | Parse valid/invalid payloads; `initializeCoralogixRum` invokes `setUserContext` mock once; prod gate skips |
| FE integration | Optional: jest with full init mock chain |
| E2E / workshop | DataPrime query: `rumDemo` sessions with `user_metadata.loadgen=1` grouped by `role` |
| Regression | Golden `rum_user` blob in `buildRumQuery.test.ts` |

Do **not** assert on real Coralogix ingest in default CI.
