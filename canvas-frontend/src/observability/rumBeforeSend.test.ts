import { CoralogixRum } from '@coralogix/browser';
import { initRumLabelContext, resetRumLabelContextForTests, setWidgetCount } from './rumLabelContext';
import { resetRumBeforeSendForTests, runBeforeSendPipeline } from './rumBeforeSend';
import { configureRumScreenshots, markRumScreenshotsSdkReady, resetRumScreenshotsForTests } from './rumScreenshots';
import { parseRumSessionConfig } from './rumSessionConfig';

jest.mock('@coralogix/browser', () => ({
  CoralogixRum: {
    screenshot: jest.fn(() => 'ss-mock-id')
  }
}));

describe('rumBeforeSend', () => {
  beforeEach(() => {
    resetRumScreenshotsForTests();
    resetRumLabelContextForTests();
    resetRumBeforeSendForTests();
    jest.clearAllMocks();
    window.__APP_CONFIG__ = { CORALOGIX_ENVIRONMENT: 'test' };
    initRumLabelContext(parseRumSessionConfig(
      window.__APP_CONFIG__,
      '?rumDemo=1&plan=enterprise&scenario=s05&integration_context=cms_media'
    ));
    setWidgetCount(1200, true);
  });

  it('merges all 10 standard session labels onto events', () => {
    const result = runBeforeSendPipeline({
      labels: {},
      page_context: { page_url: 'https://example.com/boards/abc?token=secret' }
    }, parseRumSessionConfig());

    expect(result?.labels).toMatchObject({
      plan: 'enterprise',
      userRole: 'viewer',
      feature_area: 'board',
      releaseRing: 'stable',
      widgetCount: '1200',
      isCollaborativeSession: 'false',
      integrationContext: 'cms_media',
      network_effective_type: 'unknown',
      rum_scenario: 's05'
    });
    expect(result?.page_context?.page_url).toBe('https://example.com/boards/abc');
  });

  it('attaches screenshotId on error events when screenshots are enabled', () => {
    configureRumScreenshots({
      CORALOGIX_RUM_SCREENSHOTS_ENABLED: 'true',
      CORALOGIX_ENVIRONMENT: 'test',
      CORALOGIX_RUM_SCREENSHOT_COOLDOWN_MS: '0'
    });
    markRumScreenshotsSdkReady();

    const result = runBeforeSendPipeline({
      labels: {},
      event_context: { type: 'error' }
    }, parseRumSessionConfig()) as { screenshotId?: string } | null;

    expect(result?.screenshotId).toBe('ss-mock-id');
    expect(CoralogixRum.screenshot).toHaveBeenCalledWith('rum_error');
  });

  it('does not attach screenshotId on non-error events', () => {
    configureRumScreenshots({
      CORALOGIX_RUM_SCREENSHOTS_ENABLED: 'true',
      CORALOGIX_ENVIRONMENT: 'test'
    });
    markRumScreenshotsSdkReady();

    const result = runBeforeSendPipeline({
      labels: {},
      event_context: { type: 'view' }
    }, parseRumSessionConfig()) as { screenshotId?: string } | null;

    expect(result?.screenshotId).toBeUndefined();
    expect(CoralogixRum.screenshot).not.toHaveBeenCalled();
  });
});
