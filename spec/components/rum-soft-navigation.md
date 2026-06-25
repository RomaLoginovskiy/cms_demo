# RUM Soft Navigation Tracking — Component Contract

Last updated: 2026-06-01

## Purpose

Enable Coralogix Browser SDK experimental soft navigation tracking so SPA route changes emit page-view events and partial Web Vitals (TTFB, FCP, LCP, CLS, INP) without full document reload.

**Owners**:

- `frontend/src/observability/coralogixRum.ts` (subsystem `cms-frontend`)
- `canvas-frontend/src/observability/coralogixRum.ts` (subsystem `canvas-frontend`)

## Init contract

Add to `CoralogixRum.init` options (both frontends):

```typescript
trackSoftNavigations: resolveTrackSoftNavigations(config),
```

Helper:

```typescript
function resolveTrackSoftNavigations(config: RuntimeAppConfig): boolean {
  const raw = readRuntimeValue(config.CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS);
  if (raw === undefined) return true;
  return raw === 'true' || raw === '1';
}
```

| Env var | Default | Role |
|---------|---------|------|
| `CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS` | enabled when unset | Maps to SDK `trackSoftNavigations` |

Runtime templates: add placeholder to both `public/runtime-env.template.js` files.

## Browser prerequisite

Chromium browsers must enable `#enable-experimental-web-platform-features`. Without it, init succeeds but no soft-nav events are emitted. This is expected — not an init failure.

## Interaction with existing hooks

### `urlBlueprinters`

Both apps register `pageUrlBlueprinters: [stripUrlSearchAndHash]`. SDK applies blueprinters to page URLs on soft navigation events the same as hard navigations.

| Route example | After blueprint |
|---|---|
| `/boards/abc-123?tab=shapes` | `/boards/abc-123` |
| `/cms/upload?token=x` | `/cms/upload` |

### `beforeSend`

| Frontend | Pipeline | Soft-nav impact |
|---|---|---|
| CMS | `redactRumEventUrls` only | Redacts `page_context.page_url`; no label enrichment |
| Canvas | `runBeforeSendPipeline` (labels → screenshot → trace → scenario → redact) | Enriches **session snapshot labels** at send time; `boardId_hash` may lag route change |

Canvas stages that **ignore** soft-nav events (no `network_request_context` / not `error`):

- `attachScreenshotForErrors` — skips non-errors
- `enrichTraceCorrelation` — skips non-`network-request`

Canvas stages that **apply** to soft-nav page views:

- `enrichSessionLabels` — attaches plan, feature_area, widgetCount, etc.
- `redactRumEventUrls` — strips query/hash from `page_context.page_url`
- `applyScenarioHook` — may drop event if scenario hook returns `null`

### Canvas `instrumentations.web_vitals`

Existing `metrics.tbt: true` remains. Soft nav adds per-navigation partial vitals via SDK; do not remove TBT.

## Data contracts

Soft navigation events use standard RUM page context fields processed by existing hooks:

```typescript
{
  page_context?: { page_url?: string };
  event_context?: { type?: string }; // SDK-defined page/view types
  labels?: Record<string, string>;
}
```

No new custom event types required from application code.

## Error modes

| Condition | Behavior |
|---|---|
| Env `false` / `0` | `trackSoftNavigations: false`; SDK behaves as today |
| Missing public key | RUM not initialized; flag irrelevant |
| Browser without soft-nav API | Silent no-op; only initial page load tracked |
| Scenario hook returns `null` | Event dropped; `__RUM_DEMO_STATS__.dropped` incremented (canvas only) |

## Dependencies

- `@coralogix/browser ^3.9.0`
- Transitive `web-vitals@4.2.3-soft-navs` (already in lockfiles)
- Chromium experimental flag for observable events

## Fitness functions

| Check | Command / gate |
|---|---|
| Init passes flag | `npm test -- coralogixRum.test.ts` in `frontend/` and `canvas-frontend/` |
| Env disable | Test: `CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS=false` → init mock receives `trackSoftNavigations: false` |
| URL redaction on nav URL | Existing `beforeSend` tests with `page_context.page_url` remain passing |
| Manual validation | DataPrime query in `docs/canvas-perf-rum-validation.md` § Soft navigations |

### Suggested validation query (canvas)

```text
source logs
| filter $l.subsystemname == 'cx_rum'
| filter $d.cx_rum.labels.subsystem == 'canvas-frontend'
| filter $d.cx_rum.page_context.page_url like '/boards/%'
| groupby $d.cx_rum.page_context.page_url aggregate count() as views
```

Run in Chromium with experimental platform features enabled after navigating list → board → list.

## Related

- [ADR-014: RUM Soft Navigation Tracking](../adr/ADR-014-rum-soft-navigation-tracking.md)
- [CMS Frontend RUM Tracing](cms-frontend-rum-tracing.md)
- [Canvas RUM Session Labels](canvas-rum-session-labels.md)
