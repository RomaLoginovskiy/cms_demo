import { CoralogixRum } from '@coralogix/browser';
import {
  captureScreenshot,
  configureRumScreenshots,
  isRumScreenshotsEnabled,
  markRumScreenshotsSdkReady,
  maybeCaptureLargeBoardScreenshot,
  resetRumScreenshotsForTests
} from './rumScreenshots';

jest.mock('@coralogix/browser', () => ({
  CoralogixRum: {
    screenshot: jest.fn(() => 'ss-mock-id')
  }
}));

describe('rumScreenshots', () => {
  beforeEach(() => {
    resetRumScreenshotsForTests();
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function enableScreenshots(overrides: Record<string, string> = {}): void {
    configureRumScreenshots({
      CORALOGIX_RUM_SCREENSHOTS_ENABLED: 'true',
      CORALOGIX_ENVIRONMENT: 'test',
      ...overrides
    });
    markRumScreenshotsSdkReady();
  }

  it('is disabled by default', () => {
    configureRumScreenshots({ CORALOGIX_ENVIRONMENT: 'test' });
    markRumScreenshotsSdkReady();
    expect(isRumScreenshotsEnabled()).toBe(false);
    expect(captureScreenshot('rum_error')).toBeUndefined();
  });

  it('blocks screenshots in production without allowProd', () => {
    configureRumScreenshots({
      CORALOGIX_RUM_SCREENSHOTS_ENABLED: 'true',
      CORALOGIX_ENVIRONMENT: 'production'
    });
    markRumScreenshotsSdkReady();
    expect(isRumScreenshotsEnabled()).toBe(false);
  });

  it('allows screenshots in production when allowProd is set', () => {
    configureRumScreenshots({
      CORALOGIX_RUM_SCREENSHOTS_ENABLED: 'true',
      CORALOGIX_RUM_SCREENSHOTS_ALLOW_PROD: 'true',
      CORALOGIX_ENVIRONMENT: 'production'
    });
    markRumScreenshotsSdkReady();
    expect(isRumScreenshotsEnabled()).toBe(true);
  });

  it('captures error screenshots up to maxErrors', () => {
    enableScreenshots({
      CORALOGIX_RUM_SCREENSHOT_MAX_ERRORS: '2',
      CORALOGIX_RUM_SCREENSHOT_MAX_PER_SESSION: '5',
      CORALOGIX_RUM_SCREENSHOT_COOLDOWN_MS: '0'
    });

    expect(captureScreenshot('rum_error')).toBe('ss-mock-id');
    expect(captureScreenshot('rum_error')).toBe('ss-mock-id');
    expect(captureScreenshot('rum_error')).toBeUndefined();
    expect(CoralogixRum.screenshot).toHaveBeenCalledTimes(2);
  });

  it('enforces shared cooldown between captures', () => {
    enableScreenshots({ CORALOGIX_RUM_SCREENSHOT_COOLDOWN_MS: '60000' });

    expect(captureScreenshot('rum_error')).toBe('ss-mock-id');
    expect(captureScreenshot('large_board')).toBeUndefined();
  });

  it('captures large board screenshot once when crossing threshold', () => {
    enableScreenshots({
      CORALOGIX_RUM_SCREENSHOT_THRESHOLD: '100',
      CORALOGIX_RUM_SCREENSHOT_COOLDOWN_MS: '0'
    });

    expect(maybeCaptureLargeBoardScreenshot(100, 100)).toBeUndefined();
    expect(maybeCaptureLargeBoardScreenshot(100, 101)).toBe('ss-mock-id');
    expect(maybeCaptureLargeBoardScreenshot(150, 200)).toBeUndefined();
    expect(CoralogixRum.screenshot).toHaveBeenCalledWith('large_board');
  });

  it('warns once when screenshot returns no id', () => {
    enableScreenshots({ CORALOGIX_RUM_SCREENSHOT_COOLDOWN_MS: '0' });
    (CoralogixRum.screenshot as jest.Mock).mockReturnValueOnce(undefined);
    (CoralogixRum.screenshot as jest.Mock).mockReturnValueOnce(undefined);

    expect(captureScreenshot('rum_error')).toBeUndefined();
    expect(captureScreenshot('rum_error')).toBeUndefined();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
