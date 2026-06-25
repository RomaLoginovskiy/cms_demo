const TRACE_ID_LENGTH = 32;
const SPAN_ID_LENGTH = 16;

let activeTraceId: string | null = null;
let activeSpanId: string | null = null;

export function createTraceContext(): { traceId: string; spanId: string; traceparent: string; sentryTrace: string } {
  const traceId = randomHex(TRACE_ID_LENGTH);
  const spanId = randomHex(SPAN_ID_LENGTH);
  activeTraceId = traceId;
  activeSpanId = spanId;
  const traceparent = `00-${traceId}-${spanId}-01`;
  const sentryTrace = `${traceId}-${spanId}-1`;
  return { traceId, spanId, traceparent, sentryTrace };
}

export function getActiveTraceId(): string | null {
  return activeTraceId;
}

export function injectTraceHeaders(headers: HeadersInit = {}): Headers {
  const next = new Headers(headers);
  const ctx = createTraceContext();
  next.set('traceparent', ctx.traceparent);
  next.set('sentry-trace', ctx.sentryTrace);
  return next;
}

export function parseTraceIdFromHeaders(headers: Record<string, string | undefined>): string | undefined {
  const traceparent = headers.traceparent ?? headers['traceparent'];
  if (traceparent) {
    const parts = traceparent.split('-');
    if (parts.length >= 2 && parts[1]) {
      return parts[1];
    }
  }
  const sentryTrace = headers['sentry-trace'];
  if (sentryTrace) {
    const parts = sentryTrace.split('-');
    if (parts[0]) {
      return parts[0];
    }
  }
  return activeTraceId ?? undefined;
}

export function resetRumTracingForTests(): void {
  activeTraceId = null;
  activeSpanId = null;
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
