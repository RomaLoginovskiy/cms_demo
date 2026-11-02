import {
  Attributes,
  context,
  createContextKey,
  INVALID_SPAN_CONTEXT,
  propagation,
  ROOT_CONTEXT,
  Span,
  SpanStatusCode,
  trace,
  Tracer
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Instrumentation, registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, SpanExporter, StackContextManager, WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import {
  buildOtlpIgnoreUrlPattern,
  buildTraceParentInHeaderConfig,
  readRuntimeValue,
  resolveOtlpTracesUrl,
  RuntimeAppConfig,
  stripUrlSearchAndHash
} from './coralogixRum';

const TRACER_NAME = 'cms-frontend';
const CONTEXT_PROBE_KEY = createContextKey('cms-frontend.context-manager-probe');
const NON_RECORDING_SPAN = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);

let provider: WebTracerProvider | undefined;
let tracer: Tracer | undefined;

/**
 * Starts the OpenTelemetry web SDK. Spans go as OTLP/JSON to CORALOGIX_OTLP_TRACES_URL, the same collector route
 * that carries the Coralogix RUM network spans.
 *
 * Call after initializeCoralogixRum(). With traceParentInHeader enabled, RUM registers the global context manager
 * and propagator and instruments fetch/XHR, so its client spans nest under the spans started here. When RUM is off,
 * this SDK registers those globals and instruments fetch itself, so backend calls still carry traceparent.
 */
export function initializeOpenTelemetry(
  config: RuntimeAppConfig = window.__APP_CONFIG__ ?? {},
  exporter?: SpanExporter
): boolean {
  if (tracer) {
    return true;
  }

  if (isSdkDisabled(config)) {
    return false;
  }

  const tracesUrl = resolveOtlpTracesUrl(config);
  provider = new WebTracerProvider({
    resource: buildResource(config),
    spanProcessors: [new BatchSpanProcessor(exporter ?? new OTLPTraceExporter({ url: tracesUrl }))]
  });

  const instrumentations: Instrumentation[] = [
    new DocumentLoadInstrumentation({
      applyCustomAttributesOnSpan: {
        documentLoad: redactUrlFull,
        documentFetch: redactUrlFull,
        resourceFetch: redactUrlFull
      }
    })
  ];

  if (!hasGlobalContextManager()) {
    provider.register({ contextManager: new StackContextManager() });
    instrumentations.push(new FetchInstrumentation({
      propagateTraceHeaderCorsUrls: buildTraceParentInHeaderConfig().options.propagateTraceHeaderCorsUrls,
      ignoreUrls: [buildOtlpIgnoreUrlPattern(tracesUrl)],
      applyCustomAttributesOnSpan: redactUrlFull
    }));
  }

  registerInstrumentations({ tracerProvider: provider, instrumentations });
  tracer = provider.getTracer(TRACER_NAME);
  return true;
}

/**
 * Runs `operation` inside an active span. The global context manager is stack-based, so only requests the operation
 * starts before its first `await` become children of the span.
 */
export async function traceOperation<T>(
  name: string,
  attributes: Attributes,
  operation: (span: Span) => Promise<T>
): Promise<T> {
  if (!tracer) {
    return operation(NON_RECORDING_SPAN);
  }

  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await operation(span);
    } catch (error) {
      recordFailure(span, error);
      throw error;
    } finally {
      span.end();
    }
  });
}

export async function flushOpenTelemetry(): Promise<void> {
  await provider?.forceFlush();
}

export async function resetOpenTelemetryForTests(): Promise<void> {
  await provider?.shutdown();
  provider = undefined;
  tracer = undefined;
  trace.disable();
  context.disable();
  propagation.disable();
}

function isSdkDisabled(config: RuntimeAppConfig): boolean {
  return readRuntimeValue(config.OTEL_SDK_DISABLED)?.toLowerCase() === 'true';
}

function buildResource(config: RuntimeAppConfig) {
  const application = readRuntimeValue(config.CORALOGIX_APPLICATION) || 'cms-demo';
  const subsystem = readRuntimeValue(config.CORALOGIX_SUBSYSTEM) || 'cms-frontend';
  return defaultResource().merge(resourceFromAttributes({
    [ATTR_SERVICE_NAME]: subsystem,
    [ATTR_SERVICE_VERSION]: readRuntimeValue(config.CORALOGIX_APP_VERSION) || 'dev',
    'deployment.environment.name': readRuntimeValue(config.CORALOGIX_ENVIRONMENT) || 'local',
    // The Coralogix exporter reads these before its Kubernetes-derived defaults; RUM spans set them the same way.
    'cx.application.name': application,
    'cx.subsystem.name': subsystem
  }));
}

/** RUM ships StackContextManager when traceParentInHeader is on; the no-op default drops context.with values. */
function hasGlobalContextManager(): boolean {
  const probe = ROOT_CONTEXT.setValue(CONTEXT_PROBE_KEY, true);
  return context.with(probe, () => context.active().getValue(CONTEXT_PROBE_KEY) === true);
}

/** Loadgen puts the synthetic user identity in the query string; spans keep only origin and path. */
function redactUrlFull(span: Span): void {
  const attributes = (span as Partial<{ attributes: Attributes }>).attributes;
  const url = attributes?.[ATTR_URL_FULL];
  if (typeof url === 'string') {
    span.setAttribute(ATTR_URL_FULL, stripUrlSearchAndHash(url));
  }
}

function recordFailure(span: Span, error: unknown): void {
  if (error instanceof Error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    return;
  }

  span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
}
