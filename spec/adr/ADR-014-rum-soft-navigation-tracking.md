# ADR-014: Coralogix RUM Soft Navigation Tracking

**Status**: Proposed  
**Date**: 2026-06-01

## Context

Both demo frontends are SPAs whose route changes do not trigger full document loads:

| Frontend | Routing | Example transitions |
|---|---|---|
| `frontend` (cms-frontend) | React Router `BrowserRouter` + `navigate()` | `/` → `/upload` → `/stats` → `/about` (optional `basename`) |
| `canvas-frontend` | Manual `history.pushState` + React state | `/` ↔ `/boards/:id` |

Neither frontend enables `trackSoftNavigations` today. Without it, RUM records a single initial page load; intra-app navigations and per-route Web Vitals (TTFB, FCP, LCP, CLS, INP) are missing.

Both apps use `@coralogix/browser ^3.9.0`, which already depends on `web-vitals@4.2.3-soft-navs`. The SDK exposes a top-level init flag:

```typescript
CoralogixRum.init({
  trackSoftNavigations: true, // experimental; defaults false in SDK
});
```

Per SDK docs, soft navigation capture requires Chromium `#enable-experimental-web-platform-features`. The browser heuristic expects History API use (`pushState` / `replaceState`) plus substantial DOM change — both frontends satisfy this pattern.

## Evaluation Criteria

| Characteristic | Priority |
|---|---|
| Observability | Per-route page views and partial Web Vitals for SPA transitions |
| Deployability | Single init flag; no routing refactor |
| Maintainability | Symmetric config across two thin RUM wrappers |
| Testability | Init contract asserted in existing Jest suites |
| Honest failure | Unsupported browsers produce no soft-nav events (not errors) |

| Characteristic | CMS only | Canvas only | Both (chosen) |
|---|---|---|---|
| Observability | 2 | 4 | 5 |
| Maintainability | 3 | 3 | 5 |
| Demo parity | 2 | 4 | 5 |
| Testability | 4 | 4 | 4 |
| **Total** | **11** | **15** | **19** |

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| CMS frontend only | Smallest diff | Canvas `/boards/:id` transitions remain invisible; contradicts canvas RUM demo investment |
| Canvas frontend only | Highest demo value; already has `web_vitals.tbt` | CMS gallery routes still single-page; asymmetric ops |
| **Both frontends** | Full SPA coverage; shared env + tests | Two init sites to touch (already duplicated wrappers) |
| Hardcode `true`, no env | Simplest init | No fast disable if SDK regression or ingest spike |
| Env toggle, default `false` | Safest for experimental feature | Demo cluster must remember to enable |
| **Env toggle, default `true`** | Demo-first; disable without redeploy | Operators must know unset = on |

## Decision

1. **Scope**: Enable `trackSoftNavigations` in **both** `frontend/src/observability/coralogixRum.ts` and `canvas-frontend/src/observability/coralogixRum.ts`.
2. **Configuration**: Add shared runtime env `CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS`, parsed as boolean (`true` / `1` → enabled; anything else or unresolved `${...}` placeholder → **default enabled**). Pass result to `trackSoftNavigations` at init.
3. **Canvas instrumentations**: Keep existing `instrumentations.web_vitals.metrics.tbt: true`; soft nav adds per-navigation partial vitals — complementary, not a replacement for TBT.
4. **Validation**: Document Chromium flag requirement in `docs/canvas-perf-rum-validation.md` and component contract; do not gate init on flag presence (SDK no-ops gracefully).

### Enforcement layers (cross-cutting)

| Layer | Role |
|---|---|
| SDK `trackSoftNavigations` | Registers PerformanceObserver for soft navigation entries when browser supports API |
| Chromium `#enable-experimental-web-platform-features` | Browser must expose soft-nav PerformanceNavigationTiming |
| `CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS` | App-level kill switch / explicit disable |
| `urlBlueprinters.pageUrlBlueprinters` | Normalizes `page_context.page_url` on all page events including soft nav |
| `beforeSend` | CMS: URL redaction; Canvas: label enrichment + URL redaction |

## Implications

### Positive

- Canvas board open/close and CMS tab changes appear as distinct RUM page views with route-level vitals (in Chromium with flag).
- Aligns with existing `web-vitals@4.2.3-soft-navs` transitive dependency.
- URL stripping already preserves pathnames (`/boards/:id`, `/upload`) while removing query/hash secrets.

### Negative / Risks

| Risk | Mitigation |
|---|---|
| **No events without Chromium flag** | Document in validation runbook; label dashboards "Chromium + flag only" |
| **Canvas label staleness on soft nav** | `boardId_hash` is set asynchronously in `WhiteboardPage` after fetch; early soft-nav events on `/boards/:id` may lack hash — follow-up: call `setBoardIdHash(id)` in `App.openBoard` before paint |
| **Canvas scenario `beforeSend` drops** | Demo scenario hooks can return `null`; soft-nav events pass through unless hook targets them — review scenario hooks if nav volume looks wrong |
| **Cardinality on board IDs in URL** | Pre-existing: pathname includes raw board UUID; blueprinters do not hash paths — out of scope for this ADR; consider future path blueprint `/boards/{id}` |
| **Session replay + soft nav** | Canvas `sessionRecordingConfig` always on; verify replay segments align with soft-nav timestamps in manual QA |
| **Loadgen / Playwright** | E2E validation of soft-nav events requires launch arg `--enable-experimental-web-platform-features` |

### Follow-up actions

1. Implement `trackSoftNavigations` + env parser in both `coralogixRum.ts` files.
2. Add env to `frontend/public/runtime-env.template.js`, `canvas-frontend/public/runtime-env.template.js`, and optional k8s deployment env blocks.
3. Extend Jest init assertions in both `coralogixRum.test.ts` files (default true + explicit false).
4. Optional: `setBoardIdHash` on canvas route change for label correlation.
5. Add DataPrime validation queries to `docs/canvas-perf-rum-validation.md`.

## Consultation

- Coralogix Browser SDK npm docs (`trackSoftNavigations`, `@coralogix/browser ^3.9.0`)
- Existing ADR-013 (CMS span export), ADR-012 (board load timing — orthogonal custom measurements)
