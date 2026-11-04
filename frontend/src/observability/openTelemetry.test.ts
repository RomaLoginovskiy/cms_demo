import { ProxyTracerProvider, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
  WebTracerProvider
} from '@opentelemetry/sdk-trace-web';
import { mediaApi } from '../services/api';
import {
  flushOpenTelemetry,
  initializeOpenTelemetry,
  resetOpenTelemetryForTests,
  traceOperation
} from './openTelemetry';

const config = {
  CORALOGIX_APPLICATION: 'cms-demo',
  CORALOGIX_SUBSYSTEM: 'cms-frontend',
  CORALOGIX_ENVIRONMENT: 'test',
  CORALOGIX_APP_VERSION: '1.2.3'
};

function fileList(...files: File[]): FileList {
  return {
    length: files.length,
    item: (index: number) => files[index] ?? null
  } as unknown as FileList;
}

async function finishedSpans(exporter: InMemorySpanExporter): Promise<ReadableSpan[]> {
  await flushOpenTelemetry();
  return exporter.getFinishedSpans();
}

function spanNamed(spans: ReadableSpan[], name: string): ReadableSpan {
  const span = spans.find(candidate => candidate.name === name);
  if (!span) {
    throw new Error(`span ${name} not exported; got ${spans.map(candidate => candidate.name).join(', ')}`);
  }

  return span;
}

describe('openTelemetry', () => {
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    delete window.__APP_CONFIG__;
  });

  afterEach(async () => {
    await resetOpenTelemetryForTests();
    jest.restoreAllMocks();
  });

  it('stays off when OTEL_SDK_DISABLED is true and still runs traced operations', async () => {
    expect(initializeOpenTelemetry({ ...config, OTEL_SDK_DISABLED: 'TRUE' }, exporter)).toBe(false);

    await expect(traceOperation('cms.test', {}, async () => 'done')).resolves.toBe('done');
    expect(await finishedSpans(exporter)).toHaveLength(0);
  });

  it('treats the unsubstituted runtime placeholder as enabled', () => {
    expect(initializeOpenTelemetry({ ...config, OTEL_SDK_DISABLED: '${OTEL_SDK_DISABLED}' }, exporter)).toBe(true);
  });

  it('exports operation spans with the cms-frontend resource', async () => {
    initializeOpenTelemetry(config, exporter);

    await traceOperation('cms.test', { 'cms.test.attr': 7 }, async (span) => {
      span.setAttribute('cms.test.result', 'ok');
    });

    const span = spanNamed(await finishedSpans(exporter), 'cms.test');
    expect(span.attributes).toEqual({ 'cms.test.attr': 7, 'cms.test.result': 'ok' });
    expect(span.resource.attributes).toEqual(expect.objectContaining({
      'service.name': 'cms-frontend',
      'service.version': '1.2.3',
      'deployment.environment.name': 'test',
      'cx.application.name': 'cms-demo',
      'cx.subsystem.name': 'cms-frontend',
      'telemetry.sdk.name': 'opentelemetry'
    }));
  });

  it('records failures on the span and rethrows', async () => {
    initializeOpenTelemetry(config, exporter);

    await expect(traceOperation('cms.test', {}, async () => {
      throw new Error('Upload failed with status 500');
    })).rejects.toThrow('Upload failed with status 500');

    const span = spanNamed(await finishedSpans(exporter), 'cms.test');
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: 'Upload failed with status 500' });
    expect(span.events.map(event => event.name)).toContain('exception');
  });

  it('registers its own globals when RUM has not', async () => {
    initializeOpenTelemetry(config, exporter);

    let activeSpanId: string | undefined;
    await traceOperation('cms.test', {}, async (span) => {
      activeSpanId = trace.getActiveSpan()?.spanContext().spanId;
      expect(activeSpanId).toBe(span.spanContext().spanId);
    });

    expect(activeSpanId).toBeDefined();
  });

  it('reuses RUM globals so RUM client spans nest under operation spans', async () => {
    // Stands in for CoralogixRum.init with traceParentInHeader: it registers a provider and its context manager.
    const rumExporter = new InMemorySpanExporter();
    const rumProvider = new WebTracerProvider({ spanProcessors: [new SimpleSpanProcessor(rumExporter)] });
    rumProvider.register();

    initializeOpenTelemetry(config, exporter);

    await traceOperation('cms.test', {}, async () => {
      rumProvider.getTracer('rum').startSpan('HTTP GET').end();
    });

    const operationSpan = spanNamed(await finishedSpans(exporter), 'cms.test');
    const [rumSpan] = rumExporter.getFinishedSpans();
    expect(rumSpan?.parentSpanContext?.spanId).toBe(operationSpan.spanContext().spanId);
    expect(rumSpan?.spanContext().traceId).toBe(operationSpan.spanContext().traceId);
    expect((trace.getTracerProvider() as ProxyTracerProvider).getDelegate()).toBe(rumProvider);
    await rumProvider.shutdown();
  });

  it('wraps mediaApi.upload in a span that is active when the request starts', async () => {
    initializeOpenTelemetry(config, exporter);
    let spanAtRequest: string | undefined;
    globalThis.fetch = jest.fn(async () => {
      spanAtRequest = trace.getActiveSpan()?.spanContext().spanId;
      return { ok: true, status: 201, json: async () => ({ id: 'new' }) } as Response;
    });

    await mediaApi.upload(fileList(new File(['abc'], 'photo.png', { type: 'image/png' })), { title: 'Photo' });

    const span = spanNamed(await finishedSpans(exporter), 'cms.media.upload');
    expect(spanAtRequest).toBe(span.spanContext().spanId);
    expect(span.attributes).toEqual({
      'cms.upload.file_count': 1,
      'cms.upload.total_bytes': 3,
      'cms.upload.media_type': 'image/png'
    });
  });
});
