import { getRumLabelSnapshot, incrementDroppedEvents } from './rumLabelContext';
import { captureScreenshot } from './rumScreenshots';
import { parseTraceIdFromHeaders } from './rumTracing';
import { RumSessionConfig } from './rumSessionConfig';

export type RumEvent = {
  page_context?: { page_url?: string };
  network_request_context?: {
    url?: string;
    request_headers?: Record<string, string> | Map<string, string>;
    response_headers?: Record<string, string> | Map<string, string>;
  };
  labels?: Record<string, string>;
  traceId?: string;
  screenshotId?: string;
  event_context?: { type?: string };
};

export type BeforeSendStage = <T extends RumEvent>(event: T) => T | null;

let scenarioBeforeSendHook: BeforeSendStage | null = null;

export function setScenarioBeforeSendHook(hook: BeforeSendStage | null): void {
  scenarioBeforeSendHook = hook;
}

export function runBeforeSendPipeline<T extends RumEvent>(
  event: T,
  _sessionConfig: RumSessionConfig
): T | null {
  let current: RumEvent | null = event;
  for (const stage of defaultStages) {
    if (!current) {
      return null;
    }
    current = stage(current);
  }
  return current as T;
}

const defaultStages: BeforeSendStage[] = [
  enrichSessionLabels,
  attachScreenshotForErrors,
  enrichTraceCorrelation,
  applyScenarioHook,
  redactRumEventUrls
];

function enrichSessionLabels<T extends RumEvent>(event: T): T {
  const snapshot = getRumLabelSnapshot();
  event.labels = {
    ...event.labels,
    plan: snapshot.plan,
    userRole: snapshot.userRole,
    feature_area: snapshot.feature_area,
    releaseRing: snapshot.releaseRing,
    widgetCount: snapshot.widgetCount,
    isCollaborativeSession: snapshot.isCollaborativeSession,
    integrationContext: snapshot.integrationContext,
    network_effective_type: snapshot.network_effective_type,
    ...(snapshot.boardId_hash ? { boardId_hash: snapshot.boardId_hash } : {}),
    ...(snapshot.memoryUsage_mb ? { memoryUsage_mb: snapshot.memoryUsage_mb } : {}),
    ...(snapshot.rum_scenario ? { rum_scenario: snapshot.rum_scenario } : {}),
    ...(snapshot.batch_id ? { batch_id: snapshot.batch_id } : {}),
    ...(snapshot.demo_geo ? { demo_geo: snapshot.demo_geo } : {}),
    ...(snapshot.demo_browser_family ? { demo_browser_family: snapshot.demo_browser_family } : {}),
    ...(snapshot.path_class ? { path_class: snapshot.path_class } : {})
  };
  return event;
}

function attachScreenshotForErrors<T extends RumEvent>(event: T): T {
  if (event.event_context?.type === 'error') {
    const id = captureScreenshot('rum_error');
    if (id) {
      event.screenshotId = id;
    }
  }
  return event;
}

function enrichTraceCorrelation<T extends RumEvent>(event: T): T {
  if (event.event_context?.type !== 'network-request') {
    return event;
  }

  const requestHeaders = normalizeHeaders(event.network_request_context?.request_headers);
  const responseHeaders = normalizeHeaders(event.network_request_context?.response_headers);
  const traceId = parseTraceIdFromHeaders({ ...requestHeaders, ...responseHeaders }) ?? undefined;
  if (traceId) {
    event.labels = { ...event.labels, trace_id: traceId };
    event.traceId = traceId;
  }
  return event;
}

function normalizeHeaders(
  headers?: Record<string, string> | Map<string, string>
): Record<string, string | undefined> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Map) {
    return Object.fromEntries(headers.entries());
  }
  return headers;
}

function applyScenarioHook<T extends RumEvent>(event: T): T | null {
  if (!scenarioBeforeSendHook) {
    return event;
  }
  const result = scenarioBeforeSendHook(event);
  if (result === null) {
    incrementDroppedEvents();
  }
  return result;
}

function stripUrlSearchAndHash(url: string): string {
  try {
    const parsedUrl = new URL(url, window.location.origin);
    parsedUrl.username = '';
    parsedUrl.password = '';
    parsedUrl.search = '';
    parsedUrl.hash = '';
    if (url.startsWith('/')) {
      return parsedUrl.pathname;
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(url)) {
      return parsedUrl.toString();
    }
    return url.split(/[?#]/)[0] ?? '';
  } catch {
    return url.split(/[?#]/)[0] ?? '';
  }
}

function redactRumEventUrls<T extends RumEvent>(event: T): T {
  if (event.page_context?.page_url) {
    event.page_context.page_url = stripUrlSearchAndHash(event.page_context.page_url);
  }
  if (event.network_request_context?.url) {
    event.network_request_context.url = stripUrlSearchAndHash(event.network_request_context.url);
  }
  return event;
}

export function resetRumBeforeSendForTests(): void {
  scenarioBeforeSendHook = null;
}
