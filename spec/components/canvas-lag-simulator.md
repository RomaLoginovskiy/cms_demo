# Canvas Lag Simulator (Component Contract)

## Purpose

Client-side, opt-in latency injection for the canvas whiteboard so demos and RUM investigations can reproduce ~5–6s interaction lag without changing `canvas-backend` or network infrastructure.

## Public interface

```typescript
interface CanvasLagSimConfig {
  enabled: boolean;
  mode: 'hub_outbound' | 'hub_inbound' | 'main_thread' | 'no_optimistic' | 'large_board_render';
  delayMs: number;
  jitterMs: number;
  allowProd: boolean;
  renderCostUs: number;
  largeBoardThreshold: number;
}

function readCanvasLagSimConfig(config: RuntimeAppConfig): CanvasLagSimConfig;
function isLagSimActive(config: CanvasLagSimConfig, environment: string): boolean;
function applyLagDelay(ms: number, jitterMs: number): Promise<void>;
function maybeBlockMainThread(ms: number): void; // main_thread mode only
```

Consumers:

- `BoardHubClient` — wrap `invoke`; optionally wrap inbound `connection.on` callbacks.
- `CanvasSurface` / `WhiteboardPage` — `no_optimistic` gating before `upsertShape`.
- `index.tsx` — log `canvas_lag_sim_active` once at boot when active.

## Dependencies

- `window.__APP_CONFIG__` from `public/runtime-env.template.js`
- `measurementService` for timing exports
- `CORALOGIX_ENVIRONMENT` for prod gate (same source as `coralogixRum.ts`)

## Error modes

- Invalid `mode` → treat as disabled; `rumInfoLog` warning once.
- `ENABLED` without valid delay → default 5500ms.
- Prod + enabled without `ALLOW_PROD` → **no delay applied**; log `canvas_lag_sim_blocked`.

## Fitness functions

1. With sim enabled in staging, p95 `whiteboard_interaction_commit_ms` ≥ `delayMs * 0.9` over 5m window (DataPrime).
2. With sim disabled, zero `canvas_lag_sim_active` logs and p95 commit &lt; 500ms under smoke load.
3. Unit tests: prod gate never calls `applyLagDelay` when `allowProd=false`.
