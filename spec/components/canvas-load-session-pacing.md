# Canvas Load — Session Pacing (Component Contract)

## Purpose

Stretch **some** virtual-user profile slices so Coralogix RUM session replay has sufficient duration and interaction density, without enabling `sessionRecording` in the frontend and without restarting Playwright contexts.

**Operator configuration is UI-only** (admin panel at `:8090`). YAML/ConfigMap must not enable pacing; runtime defaults keep `enabled: false`.

## Public interface

```typescript
// loadgen/canvas-load/src/engine/sessionPacing.ts (new)

export type SessionPacingTier = 'normal' | 'long';

export interface SessionPacingAssignment {
  tier: SessionPacingTier;
  thinkMultiplier: number;
  profileMaxDurationMs: number;
}

export function resolveSessionPacing(
  config: LoadConfig,
  userIndex: number,
  rng: () => number
): SessionPacingAssignment | null;
```

Returns `null` when `users.session_pacing.enabled` is `false`.

### Config (`LoadConfig.users.session_pacing`)

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `false` | Master switch |
| `long_fraction` | number | `0.2` | Fraction of VUs assigned `tier: long` |
| `long_think_multiplier` | number | `2.5` | Multiplier on `users.think_time_ms` for long tier |
| `normal_profile_max_duration_ms` | number | `120000` | Profile slice cap (normal tier) |
| `long_profile_max_duration_ms` | number | `600000` | Profile slice cap (long tier) |

Tier selection: `rng() < long_fraction` after seeding `createRng(config.run.seed + userIndex)` — same RNG stream as profiles, first draw **before** profile loop (document “tier fixed for VU lifetime”).

## Integration — `VirtualBrowserUser`

**Where to implement (minimal):**

| Piece | Location | Notes |
|---|---|---|
| Tier resolution | `sessionPacing.ts` helper | Pure function, unit-tested |
| Profile deadline | `VirtualBrowserUser` loop | `AbortSignal.any([vuAbort, profileAbort])` + timer |
| Think multiplier | `VirtualBrowserUser` loop | Shallow clone: `{ ...config, users: { ...config.users, think_time_ms: floor(base * mult) } }` |
| **Not** in profiles | — | Avoid editing 8 `while` loops for deadline |

Pseudocode:

```typescript
const pacing = resolveSessionPacing(this.config, this.userIndex, rng);
while (!this.abortController.signal.aborted) {
  const profile = pickProfile(this.config, rng);
  const profileConfig = applyThinkMultiplier(this.config, pacing);
  const profileAbort = new AbortController();
  const timer = pacing
    ? setTimeout(() => profileAbort.abort(), pacing.profileMaxDurationMs)
    : null;
  try {
    await runProfile(profile, {
      config: profileConfig,
      signal: AbortSignal.any([this.abortController.signal, profileAbort.signal]),
      // ...existing fields
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

**Do not** call `browser.newContext()` between profiles unless a future ADR adds `rotate_context_after_profile`.

## Data contracts

No wire/API changes. Prometheus (optional v1.1):

- `canvas_load_session_pacing_tier_total{ tier="long|normal" }` incremented once per VU at `start()`.

## Error modes

| Condition | Behavior |
|---|---|
| `enabled: true` but `long_fraction` out of range | Config validation fails at startup |
| `long_profile_max_duration_ms < normal_*` | Validation error |
| Profile timer fires mid-gesture | `runProfile` rejects/returns; loop picks next profile |
| `session_pacing` enabled + `run.duration` shorter than long cap | Engine abort wins; expected |

## Dependencies

| Direction | Component |
|---|---|
| In | `LoadConfig`, `createRng`, `pickProfile`, `runProfile` |
| Out | Playwright `BrowserContext` (unchanged lifetime) |
| FE | RUM init once per page load (`coralogixRum.ts`); `sessionRecording` TBD |

## Enforcement layers (cross-cutting)

| Layer | Enforces duration? | Enforces pacing? |
|---|---|---|
| `run.duration` | Engine stop (all VUs) | No |
| `session_pacing.profile_max_duration_ms` | Per profile slice | No |
| `think_time_ms` × multiplier | Interaction spacing | Yes (long tier) |
| Profile-internal intervals (`draw_interval_ms`, etc.) | Unchanged | No |

Configuring only `think_time_ms` without `session_pacing.enabled` does **not** rotate profiles or create long/short mix.

## Fitness functions

| ID | Criterion |
|---|---|
| SP-01 | `resolveSessionPacing` deterministic: same `seed+userIndex` → same tier |
| SP-02 | With `long_fraction: 1`, `profileMaxDurationMs === long_profile_max_duration_ms` |
| SP-03 | `VirtualBrowserUser` test: mocked `runProfile` called ≥2 times when pacing enabled and caps are 50ms |
| SP-04 | `npm test` in `loadgen/canvas-load` green |
| SP-05 | Workshop: with `rum-batch.yaml` pacing + `duration: 15m`, DataPrime shows ≥20% of `s01` sessions with span > 8m (manual, post `sessionRecording`) |

## Files to touch (implementation checklist)

| File | Change |
|---|---|
| `src/config/types.ts` | `users.session_pacing?` block |
| `src/config/defaults.ts` | Defaults (`enabled: false`) |
| `src/config/validate.ts` | Bounds checks when enabled |
| `src/engine/sessionPacing.ts` | **New** — `resolveSessionPacing`, `applyThinkMultiplier` |
| `src/engine/VirtualBrowserUser.ts` | Loop: pacing, timer, config clone |
| `tests/sessionPacing.test.ts` | **New** — tier + duration assignment |
| `tests/virtualBrowserUser.test.ts` | Profile rotation + timer |
| `wwwroot/index.html`, `wwwroot/app.js` | Session pacing panel + `PUT /api/control/config` |
| `README.md` (loadgen) | One paragraph on RUM replay pacing (UI-only) |

**Out of scope (minimal):** behavior files, `profilePicker.ts`, FE `sessionRecording`, context rotation.

## Test strategy

1. **Unit** — `resolveSessionPacing`: fixed seed, assert tier counts ≈ `long_fraction` over 1000 indices; assert `profileMaxDurationMs` per tier.
2. **Unit** — `applyThinkMultiplier`: `think_time_ms: 100`, multiplier `2.5` → `250`.
3. **VirtualBrowserUser mock** — `runProfile` resolves N times when `normal_profile_max_duration_ms: 10` (fast timer); long tier gets fewer iterations in same wall clock (optional).
4. **Integration (manual)** — `npm test` + deploy `rum-batch.yaml`, pause=false, verify RUM session duration distribution in Coralogix after FE enables recording.

## Recommended operator presets

| Preset | `long_fraction` | `long_profile_max_duration_ms` | `normal_profile_max_duration_ms` | `long_think_multiplier` |
|---|---|---|---|---|
| Off (default) | — | — | — | — |
| RUM workshop (`rum-batch`) | `0.25` | `720000` (12m) | `180000` (3m) | `3.0` |
| CI smoke | `1.0` | `5000` | `3000` | `1.0` |

Align `long_profile_max_duration_ms` + `run.duration` so at least one long slice completes before engine stop.
