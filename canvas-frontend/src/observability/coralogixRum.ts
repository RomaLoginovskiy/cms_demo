import { CoralogixLogSeverity, CoralogixRum } from '@coralogix/browser';
import type { EditableCxRumEvent } from '@coralogix/browser';

/** OTLP/JSON trace batch from Coralogix RUM tracesExporter (not exported by @coralogix/browser). */
export type RumTraceExporterPayload = Record<string, unknown>;
import { initRumLabelContext } from './rumLabelContext';
import { runBeforeSendPipeline } from './rumBeforeSend';
import {
  configureRumScreenshots,
  isRumScreenshotsEnabled,
  markRumScreenshotsSdkReady,
  resetRumScreenshotsForTests,
  rumScreenshot
} from './rumScreenshots';
import { startRumRuntimeMetricsSampling, stopRumRuntimeMetricsSampling } from './rumRuntimeMetrics';
import {
  applyRumUserContext,
  applyWhiteboardIdentityToRum,
  RumUserContext,
  shouldApplyRumUserContext
} from './rumUserContext';
import { parseRumSessionConfig, RumSessionConfig } from './rumSessionConfig';

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
  CANVAS_LAG_SIM_ENABLED?: string;
  CANVAS_LAG_SIM_MODE?: string;
  CANVAS_LAG_SIM_DELAY_MS?: string;
  CANVAS_LAG_SIM_JITTER_MS?: string;
  CANVAS_LAG_SIM_ALLOW_PROD?: string;
  CANVAS_LAG_SIM_RENDER_COST_US?: string;
  CANVAS_LAG_SIM_LARGE_BOARD_THRESHOLD?: string;
  RUM_DEMO_ENABLED?: string;
  RUM_DEMO_ALLOW_PROD?: string;
  RUM_DEMO_PANEL?: string;
  CORALOGIX_RUM_SCREENSHOTS_ENABLED?: string;
  CORALOGIX_RUM_SCREENSHOTS_ALLOW_PROD?: string;
  CORALOGIX_RUM_SCREENSHOT_THRESHOLD?: string;
  CORALOGIX_RUM_SCREENSHOT_COOLDOWN_MS?: string;
  CORALOGIX_RUM_SCREENSHOT_MAX_PER_SESSION?: string;
  CORALOGIX_RUM_SCREENSHOT_MAX_ERRORS?: string;
  CORALOGIX_RUM_SESSION_RECORDING_SAMPLE_RATE?: string;
  CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS?: string;
  CORALOGIX_OTLP_TRACES_URL?: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeAppConfig;
    __RUM_SESSION_CONFIG__?: RumSessionConfig;
  }
}

let initialized = false;
let missingPublicKeyWarningLogged = false;
let sessionConfig: RumSessionConfig = parseRumSessionConfig();

export function getRumSessionConfig(): RumSessionConfig {
  return sessionConfig;
}

export function initializeCoralogixRum(
  config: RuntimeAppConfig = window.__APP_CONFIG__ ?? {},
  parsedSession: RumSessionConfig = parseRumSessionConfig(config)
): boolean {
  if (initialized) {
    return true;
  }

  sessionConfig = parsedSession;
  initRumLabelContext(sessionConfig);
  window.__RUM_SESSION_CONFIG__ = sessionConfig;

  const publicKey = readRuntimeValue(config.CORALOGIX_RUM_PUBLIC_KEY);
  if (!publicKey) {
    warnMissingPublicKey();
    return false;
  }

  const subsystem = config.CORALOGIX_SUBSYSTEM || 'canvas-frontend';
  const environment = config.CORALOGIX_ENVIRONMENT || 'local';
  configureRumScreenshots(config, environment);

  CoralogixRum.init({
    public_key: publicKey,
    coralogixDomain: normalizeCoralogixDomain(config.CORALOGIX_RUM_DOMAIN),
    application: config.CORALOGIX_APPLICATION || 'cms-demo',
    environment,
    version: sessionConfig.version,
    stringifyCustomLogData: true,
    labels: {
      subsystem,
      organization_name: resolveOrganizationName(config),
      plan: sessionConfig.plan,
      feature_area: sessionConfig.featureArea,
      releaseRing: sessionConfig.releaseRing,
      ...(sessionConfig.scenarioId ? { rum_scenario: sessionConfig.scenarioId } : {}),
      ...(sessionConfig.batchId ? { batch_id: sessionConfig.batchId } : {})
    },
    beforeSend: (event: EditableCxRumEvent) => runBeforeSendPipeline(event, sessionConfig) as EditableCxRumEvent | null,
    urlBlueprinters: {
      pageUrlBlueprinters: [stripUrlSearchAndHash],
      networkUrlBlueprinters: [stripUrlSearchAndHash]
    },
    sessionConfig: {
      sessionSampleRate: parseSampleRate(config.CORALOGIX_RUM_SESSION_SAMPLE_RATE)
    },
    instrumentations: {
      web_vitals: {
        metrics: {
          tbt: true
        }
      }
    },
    sessionRecordingConfig: buildSessionRecordingConfig(config),
    trackSoftNavigations: resolveTrackSoftNavigations(config),
    tracesExporter: createTracesExporter(resolveOtlpTracesUrl(config)),
    traceParentInHeader: buildTraceParentInHeaderConfig()
  });
  initialized = true;
  markRumScreenshotsSdkReady();
  applyRumUserContext(sessionConfig, rumSetUserContext);
  if (!shouldApplyRumUserContext(sessionConfig)) {
    applyWhiteboardIdentityToRum(rumSetUserContext);
  }
  startRumRuntimeMetricsSampling();
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
  const propagateTraceHeaderCorsUrls: RegExp[] = [/\/api\//, /\/hubs\//];
  if (typeof window !== 'undefined') {
    const escapedOrigin = window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    propagateTraceHeaderCorsUrls.push(new RegExp(escapedOrigin));
  }
  return {
    enabled: true,
    options: { propagateTraceHeaderCorsUrls }
  };
}

export function rumSetUserContext(context: RumUserContext): void {
  if (!initialized) {
    return;
  }

  CoralogixRum.setUserContext({
    user_id: context.user_id,
    user_name: context.user_name ?? context.user_id,
    ...(context.user_email ? { user_email: context.user_email } : {}),
    ...(context.user_metadata ? { user_metadata: context.user_metadata } : {})
  });
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

export function rumErrorLog(message: string, data?: Record<string, unknown>, labels?: Record<string, string>): void {
  rumLog(CoralogixLogSeverity.Error, message, data, labels);
}

export function rumCriticalLog(message: string, data?: Record<string, unknown>, labels?: Record<string, string>): void {
  rumLog(CoralogixLogSeverity.Critical, message, data, labels);
}

export function rumDebugLog(message: string, data?: Record<string, unknown>, labels?: Record<string, string>): void {
  rumLog(CoralogixLogSeverity.Debug, message, data, labels);
}

export function rumCaptureError(
  error: Error,
  customData?: Record<string, unknown>,
  labels?: Record<string, string>
): void {
  if (!initialized) {
    return;
  }

  CoralogixRum.captureError(error, customData, labels);
}

export { isRumScreenshotsEnabled, rumScreenshot };

export function resetCoralogixRumForTests(): void {
  stopRumRuntimeMetricsSampling();
  resetRumScreenshotsForTests();
  initialized = false;
  missingPublicKeyWarningLogged = false;
  sessionConfig = parseRumSessionConfig();
}

function readRuntimeValue(value?: string): string | undefined {
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

function warnMissingPublicKey(): void {
  if (missingPublicKeyWarningLogged) {
    return;
  }

  missingPublicKeyWarningLogged = true;
  console.warn('Coralogix RUM disabled: CORALOGIX_RUM_PUBLIC_KEY is not configured.');
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

function parseSampleRate(value?: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.min(100, Math.max(0, parsed));
}

function buildSessionRecordingConfig(config: RuntimeAppConfig) {
  return {
    enable: true as const,
    autoStartSessionRecording: true,
    recordConsoleEvents: true,
    sessionRecordingSampleRate: parseSampleRate(config.CORALOGIX_RUM_SESSION_RECORDING_SAMPLE_RATE),
    recordCanvas: true
  };
}
