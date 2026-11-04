# CMS Frontend RUM Tracing — Component Contract

Last updated: 2026-11-02

## Purpose

Initialize Coralogix RUM for the CMS media gallery frontend. Export browser spans via `tracesExporter` to the cluster OTLP collector; export RUM logs/events via the standard SDK pipeline.

**Owner**: `frontend/src/observability/coralogixRum.ts`, `frontend/src/observability/openTelemetry.ts` ([ADR-026](../adr/ADR-026-cms-frontend-otel-web-sdk.md))  
**Entry**: `frontend/src/index.tsx` → `initializeCoralogixRum()`, then `initializeOpenTelemetry()` (order matters)

## Init contract

```typescript
CoralogixRum.init({
  public_key,
  coralogixDomain,
  application, environment, version, labels,
  beforeSend, urlBlueprinters, sessionConfig,
  trackSoftNavigations: resolveTrackSoftNavigations(config),
  ignoreUrls: [buildOtlpIgnoreUrlPattern(otlpTracesUrl)],
  tracesExporter: createTracesExporter(otlpTracesUrl),
  traceParentInHeader: buildTraceParentInHeaderConfig()
});
```

| Env var | Default | Role |
|---------|---------|------|
| `CORALOGIX_RUM_PUBLIC_KEY` | — | RUM logs (required) |
| `CORALOGIX_RUM_DOMAIN` | `EU1` | RUM region |
| `CORALOGIX_OTLP_TRACES_URL` | `/v1/traces` | `tracesExporter` and OTel SDK POST target |
| `OTEL_SDK_DISABLED` | `false` | `true` turns the OTel web SDK off (RUM unaffected) |
| `CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS` | enabled when unset | SPA soft navigation + partial Web Vitals (Chromium experimental flag required for events) |

See [rum-soft-navigation.md](rum-soft-navigation.md) for scope, browser prerequisites, and `beforeSend` / `urlBlueprinters` interaction.

## Span export path

Browser → `POST /v1/traces` (OTLP/JSON) → `rum-traces` HTTPRoute (`k8s/ingress.yaml` on the legacy manifests) →
`otel-agent:4318` → Coralogix APM. Both RUM's `tracesExporter` and the OTel SDK use this path. The webpack dev server
proxies `/v1/traces` to `OTEL_COLLECTOR_URL` (default `http://localhost:4318`).

| Source | `service.name` | Spans |
|--------|----------------|-------|
| RUM `tracesExporter` | `cms-demo` (RUM application) | fetch/XHR client spans |
| OTel SDK | `cms-frontend` | `documentLoad`, `documentFetch`, `resourceFetch`; `cms.media.*` operations; fetch client spans only when RUM is off |

## OpenTelemetry web SDK

- Own `WebTracerProvider`; registers globals only when RUM has not (probe: does `context.with` keep a value).
- `traceOperation(name, attributes, fn)` wraps every `mediaApi` call: `cms.media.list`, `.get`, `.upload`, `.update`,
  `.delete`, `.tags`, `.filter`. Errors set status `ERROR` and record the exception.
- Attributes: `cms.media.count`, `cms.tag.count`, `cms.filter.tag_count`, `cms.upload.file_count`,
  `cms.upload.total_bytes`, `cms.upload.media_type`. No ids, file names, titles or tags.
- `url.full` keeps origin and path only (loadgen puts the synthetic `rum_user` identity in the query string).
- `@opentelemetry/*` versions are pinned to the ones `@coralogix/browser` depends on; bump them together.

## Trace propagation

SDK `traceParentInHeader` on `/api/*` and same-origin requests; the RUM fetch span is the backend span's parent and a
child of the active `cms.media.*` span. Without RUM, the OTel `FetchInstrumentation` injects `traceparent` on the same
URLs. Requests to `CORALOGIX_OTLP_TRACES_URL` are ignored by both. Do not use manual `createTraceparent()`.
