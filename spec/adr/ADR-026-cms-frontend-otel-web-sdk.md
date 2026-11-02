# ADR-026: OpenTelemetry Web SDK in the CMS Frontend

**Status**: Proposed
**Date**: 2026-11-02

## Context

Since ADR-013 the CMS frontend sends browser spans only through Coralogix RUM: the SDK's fetch/XHR client spans go to
`CORALOGIX_OTLP_TRACES_URL` through `tracesExporter`, with `service.name=cms-demo`. Nothing records page loads or the
application operations (list, upload, update, delete, filter) as spans, so a trace starts at an HTTP call with no
browser-side root.

`@coralogix/browser` 4.2.0 is built on OpenTelemetry JS (api 1.9.1, SDK 2.11.0, instrumentation 0.222.0). With
`traceParentInHeader` enabled, `CoralogixRum.init` calls `WebTracerProvider.register()`, which takes the global tracer
provider, a `StackContextManager` and the W3C propagator, and it instruments fetch and XHR. A second SDK that
registered globally or patched fetch again would fail to register or emit duplicate client spans with conflicting
`traceparent` headers.

## Decision

1. **Separate provider, shared context.** `frontend/src/observability/openTelemetry.ts` builds its own
   `WebTracerProvider` (`service.name=cms-frontend`, `cx.application.name`/`cx.subsystem.name` from the RUM runtime
   config) with a `BatchSpanProcessor` and the OTLP/HTTP JSON exporter to `CORALOGIX_OTLP_TRACES_URL`. It does not
   register globally when RUM already has, so its spans become parents of the RUM fetch spans via the shared context.
2. **Fallback when RUM is off.** If no global context manager is registered (no RUM public key), the SDK registers its
   own globals and adds `FetchInstrumentation` with the same `propagateTraceHeaderCorsUrls`, so API calls still carry
   `traceparent`.
3. **Instrumentation.** `DocumentLoadInstrumentation` for page loads; `traceOperation()` spans (`cms.media.*`) around
   each `mediaApi` call. Attributes follow the funnel-event rule: counts, sizes and media type only, no ids, file
   names, titles or tags. `url.full` drops query and hash, as RUM's URL blueprinters do.
4. **Versions pinned to RUM's OpenTelemetry line.** OTel JS 3.0 needs api 1.10, which cannot use globals registered by
   api 1.9.1, so context sharing would silently break. `instrumentation-document-load` stays at 0.67.0 (the release
   built on instrumentation 0.222). Upgrade together with `@coralogix/browser`.
5. **No self-tracing.** The OTLP URL goes into RUM `ignoreUrls` and the fallback fetch `ignoreUrls`; before this, RUM
   recorded its own `tracesExporter` POSTs as network events and sent `traceparent` on them.
6. **Kill switch.** `OTEL_SDK_DISABLED=true` in the runtime config turns the SDK off; RUM is unaffected.

## Implications

- One trace per operation: `cms.media.*` (cms-frontend) → RUM `GET`/`POST` (cms-demo) → backend server span.
- The stack context manager ends at the first `await`, so only requests a traced operation starts before its first
  `await` nest under it. Multi-step user journeys need explicit context passing (or a zone context manager, which RUM's
  registration rules out).
- With a RUM session sample rate below 100, unsampled sessions drop the RUM client span but still send its id in
  `traceparent`, so the backend span's parent is missing in those traces.
- Browser span volume grows by about 5–20 spans per page load (document and resource fetches).

## Related

- [ADR-013](ADR-013-cms-frontend-rum-span-export.md)
- [cms-frontend-rum-tracing.md](../components/cms-frontend-rum-tracing.md)
