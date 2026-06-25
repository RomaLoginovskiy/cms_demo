# ADR-013: CMS Frontend RUM Span Export and Trace Propagation

**Status**: Accepted  
**Date**: 2026-06-01

## Context

CMS and canvas frontends initialize Coralogix RUM via `initializeCoralogixRum()` with `public_key` + `coralogixDomain`. Browser **traces** must be exported through a custom `tracesExporter` callback to the demo OpenTelemetry collector (OTLP/JSON over HTTP), while RUM **logs/events** continue through the standard RUM SDK pipeline.

Server APIs (`DemoCms.Api`, `demo-canvas-api`) export spans via OTLP/protobuf to the node `otel-agent` daemonset (`http://$(NODE):4318`).

## Decision

1. **Browser traces**: Set `tracesExporter` on `CoralogixRum.init` to POST `TraceExporterData` as JSON to `CORALOGIX_OTLP_TRACES_URL` (default `/v1/traces`), routed by ingress to `otel-gateway:4318` with a `traces` pipeline → Coralogix exporter.
2. **RUM logs**: Unchanged — no `tracesExporter` involvement; SDK default log export via `public_key` + `coralogixDomain`.
3. **Trace propagation**: Enable `traceParentInHeader` on instrumented fetch/XHR; remove hand-rolled `tracing.ts` on CMS frontend.
4. **Canvas S08 demo**: Keep scenario-gated `rumTracing.ts` headers in `rumFetch.ts` only when `s08_trace` / `s06_slow_api` is active.
5. **Canvas backend**: Add OpenTelemetry mirroring `DemoCms.Api` (ASP.NET Core + EF instrumentation, OTLP to `$(NODE):4318`).

## Implications

- Browser spans appear in **APM/traces** (via collector), not embedded in RUM log payloads.
- No APM private key in the browser; collector holds `CORALOGIX_PRIVATE_KEY`.
- Full RUM ↔ APM UI join still requires backend W3C context extraction (follow-up).

## Related

- [cms-frontend-rum-tracing.md](../components/cms-frontend-rum-tracing.md)
- [canvas-backend-otel.md](../components/canvas-backend-otel.md)
