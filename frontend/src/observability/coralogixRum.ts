import { CoralogixLogSeverity, CoralogixRum } from '@coralogix/browser';
import { isLoadgenSyntheticUser, parseRumUserParam } from './rumUserContext';

/** OTLP/JSON trace batch from Coralogix RUM tracesExporter (not exported by @coralogix/browser). */
export type RumTraceExporterPayload = Record<string, unknown>;

type CoralogixDomain = 'EU1' | 'EU2' | 'US1' | 'US2' | 'US3' | 'AP1' | 'AP2' | 'AP3';

const CORALOGIX_DOMAINS: CoralogixDomain[] = ['EU1', 'EU2', 'US1', 'US2', 'US3', 'AP1', 'AP2', 'AP3'];
const DEFAULT_ORGANIZATION_NAME = 'Acme Digital Works';
export const DEFAULT_OTLP_TRACES_URL = '/v1/traces';

export interface RuntimeAppConfig {
  CORALOGIX_RUM_PUBLIC_KEY?: string;
  CORALOGIX_RUM_DOMAIN?: string;
  CORALOGIX_APPLICATION?: string;
  CORALOGIX_SUBSYSTEM?: string;
  CORALOGIX_ORGANIZATION_NAME?: string;
  CORALOGIX_ENVIRONMENT?: string;
  CORALOGIX_APP_VERSION?: string;
  CORALOGIX_RUM_SESSION_SAMPLE_RATE?: string;
  CORALOGIX_RUM_SESSION_RECORDING_ENABLED?: string;
  CORALOGIX_RUM_SESSION_RECORDING_SAMPLE_RATE?: string;
  CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS?: string;
  CORALOGIX_OTLP_TRACES_URL?: string;
  OTEL_SDK_DISABLED?: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeAppConfig;
  }
}

let initialized = false;
let missingPublicKeyWarningLogged = false;

export function initializeCoralogixRum(config: RuntimeAppConfig = window.__APP_CONFIG__ ?? {}): boolean {
  if (initialized) {
    return true;
  }

  const publicKey = readRuntimeValue(config.CORALOGIX_RUM_PUBLIC_KEY);
  if (!publicKey) {
    warnMissingPublicKey();
    return false;
  }

  const otlpTracesUrl = resolveOtlpTracesUrl(config);
  CoralogixRum.init({
    public_key: publicKey,
    coralogixDomain: normalizeCoralogixDomain(config.CORALOGIX_RUM_DOMAIN),
    application: config.CORALOGIX_APPLICATION || 'cms-demo',
    environment: config.CORALOGIX_ENVIRONMENT || 'local',
    version: config.CORALOGIX_APP_VERSION || 'dev',
    stringifyCustomLogData: true,
    labels: {
      subsystem: config.CORALOGIX_SUBSYSTEM || 'cms-frontend',
      organization_name: resolveOrganizationName(config)
    },
    beforeSend: redactRumEventUrls,
    urlBlueprinters: {
      pageUrlBlueprinters: [stripUrlSearchAndHash],
      networkUrlBlueprinters: [stripUrlSearchAndHash]
    },
    sessionConfig: {
      sessionSampleRate: parseSampleRate(config.CORALOGIX_RUM_SESSION_SAMPLE_RATE)
    },
    sessionRecordingConfig: buildSessionRecordingConfig(config),
    trackSoftNavigations: resolveTrackSoftNavigations(config),
    // Span export POSTs go through the patched fetch; without this they become network events carrying traceparent.
    ignoreUrls: [buildOtlpIgnoreUrlPattern(otlpTracesUrl)],
    tracesExporter: createTracesExporter(otlpTracesUrl),
    traceParentInHeader: buildTraceParentInHeaderConfig()
  });
  initialized = true;
  applySyntheticUserContext(config);
  return true;
}

export function resolveOtlpTracesUrl(config: RuntimeAppConfig = {}): string {
  const value = readRuntimeValue(config.CORALOGIX_OTLP_TRACES_URL);
  return value || DEFAULT_OTLP_TRACES_URL;
}

export function createTracesExporter(endpoint: string): (data: unknown) => void {
  return (data: unknown) => {
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }).catch((error) => {
      console.error('Failed to export RUM traces to OTLP collector:', error);
    });
  };
}

export function buildTraceParentInHeaderConfig(): {
  enabled: true;
  options: { propagateTraceHeaderCorsUrls: RegExp[] };
} {
  const propagateTraceHeaderCorsUrls: RegExp[] = [/\/api\//];
  if (typeof window !== 'undefined') {
    propagateTraceHeaderCorsUrls.push(new RegExp(escapeRegExp(window.location.origin)));
  }
  return {
    enabled: true,
    options: { propagateTraceHeaderCorsUrls }
  };
}

/** Matches the absolute OTLP traces URL that fetch instrumentation sees for a relative or absolute endpoint. */
export function buildOtlpIgnoreUrlPattern(endpoint: string): RegExp {
  const absoluteUrl = typeof window === 'undefined' ? endpoint : new URL(endpoint, window.location.origin).href;
  return new RegExp(`^${escapeRegExp(absoluteUrl)}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeCoralogixDomain(value?: string): CoralogixDomain {
  const normalized = value?.trim().toLowerCase() ?? '';
  const matchedDomain = CORALOGIX_DOMAINS.find(domain => normalized.includes(domain.toLowerCase()));
  if (matchedDomain) {
    return matchedDomain;
  }

  return 'EU1';
}

export function rumStartTimeMeasure(name: string, labels?: Record<string, string>): void {
  if (!initialized) {
    return;
  }

  CoralogixRum.startTimeMeasure(name, labels);
}

export function rumEndTimeMeasure(name: string): void {
  if (!initialized) {
    return;
  }

  CoralogixRum.endTimeMeasure(name);
}

export function rumSendCustomMeasurement(name: string, value: number): void {
  if (!initialized) {
    return;
  }

  CoralogixRum.sendCustomMeasurement(name, value);
}

export function rumAddTiming(name: string, customTime?: number): void {
  if (!initialized) {
    return;
  }

  if (customTime === undefined) {
    CoralogixRum.addTiming(name);
    return;
  }

  CoralogixRum.addTiming(name, customTime);
}

export function rumLog(
  severity: CoralogixLogSeverity,
  message: string,
  data?: Record<string, unknown>,
  labels?: Record<string, string>
): void {
  if (!initialized) {
    return;
  }

  CoralogixRum.log(severity, message, data, labels);
}

export function rumInfoLog(message: string, data?: Record<string, unknown>, labels?: Record<string, string>): void {
  rumLog(CoralogixLogSeverity.Info, message, data, labels);
}

export function rumWarnLog(message: string, data?: Record<string, unknown>, labels?: Record<string, string>): void {
  rumLog(CoralogixLogSeverity.Warn, message, data, labels);
}

export function rumTrackEvent(name: string, data?: Record<string, unknown>): void {
  if (!initialized) {
    return;
  }

  rumInfoLog(name, data, { event_type: 'cms_funnel' });
}

export function rumDebugLog(message: string, data?: Record<string, unknown>, labels?: Record<string, string>): void {
  rumLog(CoralogixLogSeverity.Debug, message, data, labels);
}

export function resetCoralogixRumForTests(): void {
  initialized = false;
  missingPublicKeyWarningLogged = false;
}

export function readRuntimeValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{[^}]+}$/.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function resolveOrganizationName(config: RuntimeAppConfig): string {
  const value = readRuntimeValue(config.CORALOGIX_ORGANIZATION_NAME);
  return value || DEFAULT_ORGANIZATION_NAME;
}

export function resolveTrackSoftNavigations(config: RuntimeAppConfig): boolean {
  const raw = readRuntimeValue(config.CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS);
  if (raw === undefined) {
    return true;
  }

  return raw === 'true' || raw === '1';
}

/** Session replay is opt-in: disabled unless CORALOGIX_RUM_SESSION_RECORDING_ENABLED is true/1. */
export function resolveSessionRecordingEnabled(config: RuntimeAppConfig): boolean {
  const raw = readRuntimeValue(config.CORALOGIX_RUM_SESSION_RECORDING_ENABLED);
  return raw === 'true' || raw === '1';
}

function warnMissingPublicKey(): void {
  if (missingPublicKeyWarningLogged) {
    return;
  }

  missingPublicKeyWarningLogged = true;
  console.warn('Coralogix RUM disabled: CORALOGIX_RUM_PUBLIC_KEY is not configured.');
}

export function stripUrlSearchAndHash(url: string): string {
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

function redactRumEventUrls<T extends {
  page_context?: { page_url?: string };
  network_request_context?: { url?: string };
}>(event: T): T {
  if (event.page_context?.page_url) {
    event.page_context.page_url = stripUrlSearchAndHash(event.page_context.page_url);
  }

  if (event.network_request_context?.url) {
    event.network_request_context.url = stripUrlSearchAndHash(event.network_request_context.url);
  }

  return event;
}

function buildSessionRecordingConfig(config: RuntimeAppConfig) {
  if (!resolveSessionRecordingEnabled(config)) {
    return { enable: false, autoStartSessionRecording: false };
  }

  return {
    enable: true,
    autoStartSessionRecording: true,
    recordConsoleEvents: true,
    sessionRecordingSampleRate: parseSampleRate(config.CORALOGIX_RUM_SESSION_RECORDING_SAMPLE_RATE)
  };
}

/** Loadgen passes a base64url `rum_user` query param so synthetic sessions carry a stable identity. */
function applySyntheticUserContext(config: RuntimeAppConfig): void {
  if (typeof window === 'undefined') {
    return;
  }

  const context = parseRumUserParam(new URLSearchParams(window.location.search).get('rum_user'));
  if (!context || !isLoadgenSyntheticUser(context)) {
    return;
  }

  const { user_id, user_name, user_email, user_metadata } = context;
  CoralogixRum.setUserContext({
    user_id,
    user_name: user_name ?? user_id,
    ...(user_email ? { user_email } : {}),
    account_id: String(user_metadata?.plan ?? 'free'),
    account_name: resolveOrganizationName(config),
    ...(user_metadata ? { user_metadata } : {})
  });
}

function parseSampleRate(value?: string): number {
  // Unset runtime env vars arrive as "", and Number("") is 0 — treat blank as "use default".
  const trimmed = value?.trim();
  const parsed = trimmed ? Number(trimmed) : NaN;
  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.min(100, Math.max(0, parsed));
}
