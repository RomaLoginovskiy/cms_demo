# CMS Frontend RUM Tracing — Component Contract

Last updated: 2026-06-01

## Purpose

Initialize Coralogix RUM for the CMS media gallery frontend. Export browser spans via `tracesExporter` to the cluster OTLP collector; export RUM logs/events via the standard SDK pipeline.

**Owner**: `frontend/src/observability/coralogixRum.ts`  
**Entry**: `frontend/src/index.tsx` → `initializeCoralogixRum()`

## Init contract

```typescript
CoralogixRum.init({
  public_key,
  coralogixDomain,
  application, environment, version, labels,
  beforeSend, urlBlueprinters, sessionConfig,
  trackSoftNavigations: resolveTrackSoftNavigations(config),
  tracesExporter: createTracesExporter(resolveOtlpTracesUrl(config)),
  traceParentInHeader: buildTraceParentInHeaderConfig()
});
```

| Env var | Default | Role |
|---------|---------|------|
| `CORALOGIX_RUM_PUBLIC_KEY` | — | RUM logs (required) |
| `CORALOGIX_RUM_DOMAIN` | `EU1` | RUM region |
| `CORALOGIX_OTLP_TRACES_URL` | `/v1/traces` | `tracesExporter` POST target |
| `CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS` | enabled when unset | SPA soft navigation + partial Web Vitals (Chromium experimental flag required for events) |

See [rum-soft-navigation.md](rum-soft-navigation.md) for scope, browser prerequisites, and `beforeSend` / `urlBlueprinters` interaction.

## Span export path

Browser → `POST /v1/traces` (JSON) → ingress → `otel-gateway:4318` → Coralogix APM.

## Trace propagation

SDK `traceParentInHeader` on `/api/*` and same-origin requests. Do not use manual `createTraceparent()`.
