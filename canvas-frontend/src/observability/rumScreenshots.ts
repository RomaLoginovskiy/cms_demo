import { CoralogixRum } from '@coralogix/browser';
import type { RuntimeAppConfig } from './coralogixRum';

export type ScreenshotReason = 'rum_error' | 'large_board';

export interface RumScreenshotsConfig {
  enabled: boolean;
  allowProd: boolean;
  shapeThreshold: number;
  cooldownMs: number;
  maxPerSession: number;
  maxErrors: number;
  sessionRecordingSampleRate: number;
}

const DEFAULTS: Omit<RumScreenshotsConfig, 'enabled' | 'allowProd'> = {
  shapeThreshold: 100,
  cooldownMs: 30_000,
  maxPerSession: 5,
  maxErrors: 3,
  sessionRecordingSampleRate: 100
};

let config: RumScreenshotsConfig = { enabled: false, allowProd: false, ...DEFAULTS };
let configuredEnvironment = 'local';
let rumInitialized = false;
let lastCaptureAt = 0;
let totalCaptures = 0;
let errorCaptures = 0;
let largeBoardScreenshotTaken = false;
let screenshotFailureWarned = false;

export function configureRumScreenshots(
  runtime: RuntimeAppConfig = window.__APP_CONFIG__ ?? {},
  environment = runtime.CORALOGIX_ENVIRONMENT ?? 'local'
): RumScreenshotsConfig {
  configuredEnvironment = environment.trim().toLowerCase();
  config = {
    enabled: parseBool(runtime.CORALOGIX_RUM_SCREENSHOTS_ENABLED),
    allowProd: parseBool(runtime.CORALOGIX_RUM_SCREENSHOTS_ALLOW_PROD),
    shapeThreshold: parsePositiveInt(runtime.CORALOGIX_RUM_SCREENSHOT_THRESHOLD, DEFAULTS.shapeThreshold),
    cooldownMs: parseNonNegativeInt(runtime.CORALOGIX_RUM_SCREENSHOT_COOLDOWN_MS, DEFAULTS.cooldownMs),
    maxPerSession: parsePositiveInt(runtime.CORALOGIX_RUM_SCREENSHOT_MAX_PER_SESSION, DEFAULTS.maxPerSession),
    maxErrors: parsePositiveInt(runtime.CORALOGIX_RUM_SCREENSHOT_MAX_ERRORS, DEFAULTS.maxErrors),
    sessionRecordingSampleRate: clampSampleRate(
      parsePositiveInt(runtime.CORALOGIX_RUM_SESSION_RECORDING_SAMPLE_RATE, DEFAULTS.sessionRecordingSampleRate)
    )
  };
  return config;
}

export function getRumScreenshotsConfig(): RumScreenshotsConfig {
  return config;
}

export function markRumScreenshotsSdkReady(): void {
  rumInitialized = true;
}

export function isRumScreenshotsEnabled(
  runtime: RuntimeAppConfig = window.__APP_CONFIG__ ?? {},
  environment = runtime.CORALOGIX_ENVIRONMENT ?? configuredEnvironment
): boolean {
  const resolved = config.enabled ? config : configureRumScreenshots(runtime, environment);
  if (!resolved.enabled || !rumInitialized) {
    return false;
  }

  const env = environment.trim().toLowerCase() || configuredEnvironment;
  if (env === 'production' && !resolved.allowProd) {
    return false;
  }

  return true;
}

export function captureScreenshot(reason: ScreenshotReason): string | undefined {
  if (!isRumScreenshotsEnabled()) {
    return undefined;
  }

  if (reason === 'rum_error') {
    if (errorCaptures >= config.maxErrors) {
      return undefined;
    }
  } else if (largeBoardScreenshotTaken) {
    return undefined;
  }

  if (totalCaptures >= config.maxPerSession) {
    return undefined;
  }

  const now = Date.now();
  if (lastCaptureAt > 0 && now - lastCaptureAt < config.cooldownMs) {
    return undefined;
  }

  const description = reason === 'rum_error' ? 'rum_error' : 'large_board';
  const id = CoralogixRum.screenshot(description);
  if (!id) {
    warnScreenshotFailureOnce();
    return undefined;
  }

  lastCaptureAt = now;
  totalCaptures += 1;
  if (reason === 'rum_error') {
    errorCaptures += 1;
  } else {
    largeBoardScreenshotTaken = true;
  }

  return id;
}

export function maybeCaptureLargeBoardScreenshot(prevCount: number, nextCount: number): string | undefined {
  if (!isRumScreenshotsEnabled()) {
    return undefined;
  }

  const threshold = config.shapeThreshold;
  if (prevCount > threshold || nextCount <= threshold) {
    return undefined;
  }

  return captureScreenshot('large_board');
}

export function rumScreenshot(description?: string): string | undefined {
  if (!isRumScreenshotsEnabled()) {
    return undefined;
  }

  if (totalCaptures >= config.maxPerSession) {
    return undefined;
  }

  const now = Date.now();
  if (lastCaptureAt > 0 && now - lastCaptureAt < config.cooldownMs) {
    return undefined;
  }

  const id = CoralogixRum.screenshot(description);
  if (!id) {
    warnScreenshotFailureOnce();
    return undefined;
  }

  lastCaptureAt = now;
  totalCaptures += 1;
  return id;
}

export function resetRumScreenshotsForTests(): void {
  config = { enabled: false, allowProd: false, ...DEFAULTS };
  configuredEnvironment = 'local';
  rumInitialized = false;
  lastCaptureAt = 0;
  totalCaptures = 0;
  errorCaptures = 0;
  largeBoardScreenshotTaken = false;
  screenshotFailureWarned = false;
}

function warnScreenshotFailureOnce(): void {
  if (screenshotFailureWarned) {
    return;
  }
  screenshotFailureWarned = true;
  console.warn('Coralogix RUM screenshot capture returned no id.');
}

function parseBool(value?: string): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function clampSampleRate(value: number): number {
  return Math.min(100, Math.max(0, value));
}
