# ADR-007: Loadgen Session Pacing for Long RUM Replays

**Status**: Proposed  
**Date**: 2026-05-29

## Context

`VirtualBrowserUser` runs `pickProfile` → `runProfile` in a loop, but every profile implementation blocks in `while (!ctx.signal.aborted)` and **never returns** unless the VU is stopped. In practice each VU executes **one profile for its entire lifetime**; `pickProfile` is dead code after the first iteration.

Coralogix RUM **session replay** is enabled in `canvas-frontend` [`coralogixRum.ts`](../../canvas-frontend/src/observability/coralogixRum.ts) via `sessionRecordingConfig` (`enable`, `autoStartSessionRecording`, `recordCanvas`, etc.) whenever RUM initializes. Replays still need sessions with enough wall-clock time and interaction density. Today:

- `users.think_time_ms` (default 100) and per-profile `jitterMs` intervals set event spacing.
- `run.duration` (e.g. `15m` in `config/rum-batch.yaml`) caps the **engine**, not individual profile slices.
- One Playwright `BrowserContext` per VU → one RUM SDK init per first navigation → **one RUM session id** for the VU lifetime (until full reload/navigation re-inits the page).
- Loadgen pacing changes do not depend on optional screenshot flags; session recording is always on with a valid RUM public key.

Operators need **some** VUs to produce **longer, richer** single-session timelines without rewriting all profiles or restarting contexts (which would fragment replay).

## Evaluation Criteria

| Characteristic | Priority | Notes |
|---|---|---|
| **Observability** | High | Long-tail sessions for replay QA; distinct from short churn VUs |
| **Maintainability** | High | Minimal diff; no duplicate pacing logic in 8 profiles |
| **Testability** | High | Deterministic tier from `seed + userIndex`; unit tests without Playwright |
| **Performance** | Medium | Long fraction must not dominate pod memory (still bounded by `run.duration`) |
| **Deployability** | Medium | YAML in `rum-batch.yaml` / `k8s/canvas-load-configmap.yaml` |

### Option scoring (1 = poor, 5 = excellent)

| Characteristic | A: Profile max duration + think multiplier (VU loop) | B: Global `think_time_ms` bump | C: New `long_lurker` profile in mix |
|---|---|---|---|
| Observability (long-tail) | 5 | 2 | 4 |
| Maintainability | 5 | 5 | 2 |
| Testability | 5 | 4 | 3 |
| Minimal code touch | 5 | 5 | 2 |
| **Total** | **20** | **16** | **11** |

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| **A: `users.session_pacing` — per-VU tier, profile deadline in `VirtualBrowserUser`, think multiplier via config clone** | Fixes dead `pickProfile`; no behavior loop edits for deadline; deterministic | Behaviors unchanged unless multiplier applied via cloned `think_time_ms` |
| **B: Raise global `think_time_ms`** | Trivial | All VUs slow; no long/short mix |
| **C: Dedicated long profiles** | Explicit mix control | Duplicates lurker/drawer logic; mix math drift |
| **D: Restart `BrowserContext` mid-run for length** | Could force new session ids | **Shorter** per-session replay; opposite of goal |

## Decision

Adopt **Option A**: add optional `users.session_pacing` block. Enforcement split:

| Concern | Layer | Mechanism |
|---|---|---|
| Long vs normal **tier** | Helper `resolveSessionPacing(config, userIndex, rng)` | Deterministic from `run.seed + userIndex`; `long_fraction` Bernoulli |
| **Profile wall-clock cap** | `VirtualBrowserUser` only | Nested `AbortController` + `setTimeout(profileMaxDurationMs)` linked into `ctx.signal` |
| **Slower interaction pacing** | `VirtualBrowserUser` only | Clone `LoadConfig` with `think_time_ms * long_think_multiplier` for long tier before `runProfile` |
| **BrowserContext lifecycle** | Unchanged | **Do not** restart context for longer replay; same context preserves one RUM session id |

When `session_pacing.enabled` is `false` (default), behavior matches today: no profile timeout, single profile until engine stop.

### Recommended config schema

```yaml
users:
  think_time_ms: 100
  session_pacing:
    enabled: false              # default: off (backward compatible)
    long_fraction: 0.2          # [0,1] — share of VUs in long tier
    long_think_multiplier: 2.5  # multiplies users.think_time_ms for long tier only
    normal_profile_max_duration_ms: 120000   # 2m — ends profile → pickProfile again
    long_profile_max_duration_ms: 600000     # 10m — long-tier cap per profile slice
```

Validation when `enabled: true`:

- `0 <= long_fraction <= 1`
- `long_think_multiplier >= 1`
- `long_profile_max_duration_ms >= normal_profile_max_duration_ms >= 60000` (minimum 1m normal slice)

Optional `rum_batch` overlay (documentation only; same fields under `users`):

```yaml
# config/rum-batch.yaml (recommended overlay when enabled: true)
users:
  session_pacing:
    enabled: true
    long_fraction: 0.25
    long_think_multiplier: 3.0
    normal_profile_max_duration_ms: 180000   # 3m
    long_profile_max_duration_ms: 720000     # 12m — fits inside run.duration: 15m
run:
  duration: 15m
```

### Default durations (ms)

| Field | Default | Rationale |
|---|---|---|
| `normal_profile_max_duration_ms` | `120000` (2m) | Enough for board open + dozens of actions; enables profile rotation |
| `long_profile_max_duration_ms` | `600000` (10m) | Coralogix replay workshops often target 5–15m; leaves headroom under 15m engine run |
| `long_think_multiplier` | `2.5` | Stretches dwell without zeroing throughput |
| `long_fraction` | `0.2` | ~10 of 50 UC1 VUs long-tail; rest provide churn |

### Browser context / new RUM session IDs

| Action | Effect on RUM session |
|---|---|
| Keep one `BrowserContext` per VU (decision) | Single session id for replay continuity |
| `context.newPage()` after crash | Same session (same document origin / SDK singleton) |
| Full `page.goto` reload (chaos profile) | May re-init SDK depending on FE — treat as edge case |
| **Deferred:** `session_pacing.rotate_context_after_profile: true` | New session id each profile — only if product wants many short replays |

**Do not** restart browser context solely to extend session length.

## Implications

### Positive

- Long-tier VUs accumulate more RUM events before engine stop.
- Profile timeout makes `pickProfile` meaningful again (mix diversity per VU).
- Pacing is off by default; production steady-state `canvas-load-configmap` unchanged until opted in.

### Negative / Risks

| Risk | Mitigation |
|---|---|
| Profile abort mid-action | Profiles already check `signal.aborted`; deadline uses same signal |
| Long VUs increase SQLite/hub load | Cap `long_fraction`; keep `run.duration` |
| Replay empty for very short sessions | Use session pacing + `immediateFlush` if needed (SDK option) |
| `think_time_ms` clone is shallow — hot reload of config mid-run | `updateConfig` should re-resolve tier or document “tier fixed at start” |

### Operator surface

Session pacing is configured **only via the canvas-load admin UI** (`:8090` → Session pacing → Apply). Defaults are off in code (`defaults.ts`); do not commit `session_pacing` to `load.yaml`, `rum-batch.yaml`, or `k8s/canvas-load-configmap.yaml`.

### Follow-up actions

1. Implement `resolveSessionPacing` + `VirtualBrowserUser` deadline and config clone.
2. Add `users.session_pacing` to `LoadConfig`, `defaults.ts`, `validate.ts`.
3. Admin UI controls + `PUT /api/control/config` merge.
4. ~~Enable `sessionRecordingConfig` in `coralogixRum.ts`~~ (done).
5. Metric (optional): `canvas_load_session_pacing_tier_total{tier="long|normal"}`.

## Consultation

- Existing contracts: [canvas-rum-loadgen-extension.md](../components/canvas-rum-loadgen-extension.md), [ADR-006](ADR-006-rum-synthetic-user-context-load-testing.md)
- Source: `loadgen/canvas-load/src/engine/VirtualBrowserUser.ts`, profile `while (!aborted)` loops
