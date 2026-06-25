import {
  createTracesExporter,
  DEFAULT_OTLP_TRACES_URL,
  initializeCoralogixRum,
  normalizeCoralogixDomain,
  resetCoralogixRumForTests,
  resolveOtlpTracesUrl,
  resolveTrackSoftNavigations,
  rumSendCustomMeasurement
} from './coralogixRum';
import { CoralogixRum } from '@coralogix/browser';

jest.mock('@coralogix/browser', () => ({
  CoralogixRum: {
    init: jest.fn(),
    sendCustomMeasurement: jest.fn(),
    setUserContext: jest.fn(),
    screenshot: jest.fn(() => 'ss-mock-id'),
    startSessionRecording: jest.fn(),
    stopSessionRecording: jest.fn()
  },
  CoralogixLogSeverity: {
    Info: 'info',
    Warn: 'warn',
    Error: 'error',
    Critical: 'critical'
  }
}));

describe('coralogixRum', () => {
  beforeEach(() => {
    resetCoralogixRumForTests();
    jest.clearAllMocks();
    delete window.__APP_CONFIG__;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stays disabled when runtime public key is absent', () => {
    expect(initializeCoralogixRum()).toBe(false);

    rumSendCustomMeasurement('canvas_event', 1);

    expect(CoralogixRum.init).not.toHaveBeenCalled();
    expect(CoralogixRum.sendCustomMeasurement).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith('Coralogix RUM disabled: CORALOGIX_RUM_PUBLIC_KEY is not configured.');
  });

  it('initializes with runtime config and normalized Coralogix domain', () => {
    window.__APP_CONFIG__ = {
      CORALOGIX_RUM_PUBLIC_KEY: 'public-rum-key',
      CORALOGIX_RUM_DOMAIN: 'eu1.coralogix.com',
      CORALOGIX_APPLICATION: 'cms-demo',
      CORALOGIX_SUBSYSTEM: 'canvas-frontend',
      CORALOGIX_ENVIRONMENT: 'test',
      CORALOGIX_APP_VERSION: '1.2.3',
      CORALOGIX_RUM_SESSION_SAMPLE_RATE: '25'
    };

    expect(initializeCoralogixRum()).toBe(true);

    expect(CoralogixRum.init).toHaveBeenCalledWith({
      public_key: 'public-rum-key',
      coralogixDomain: 'EU1',
      application: 'cms-demo',
      environment: 'test',
      version: '1.2.3',
      stringifyCustomLogData: true,
      labels: {
        subsystem: 'canvas-frontend',
        organization_name: 'Acme Digital Works',
        plan: 'free',
        feature_area: 'board',
        releaseRing: 'stable'
      },
      beforeSend: expect.any(Function),
      urlBlueprinters: {
        pageUrlBlueprinters: [expect.any(Function)],
        networkUrlBlueprinters: [expect.any(Function)]
      },
      sessionConfig: {
        sessionSampleRate: 25
      },
      instrumentations: {
        web_vitals: {
          metrics: {
            tbt: true
          }
        }
      },
      sessionRecordingConfig: {
        enable: true,
        autoStartSessionRecording: true,
        recordConsoleEvents: true,
        sessionRecordingSampleRate: 100,
        recordCanvas: true
      },
      trackSoftNavigations: true,
      tracesExporter: expect.any(Function),
      traceParentInHeader: {
        enabled: true,
        options: {
          propagateTraceHeaderCorsUrls: expect.any(Array)
        }
      }
    });

    const initOptions = (CoralogixRum.init as jest.Mock).mock.calls[0][0];
    expect(initOptions.traceParentInHeader.enabled).toBe(true);
    expect(initOptions.urlBlueprinters.pageUrlBlueprinters[0]('https://example.com/path?token=secret#hash'))
      .toBe('https://example.com/path');
    expect(initOptions.urlBlueprinters.pageUrlBlueprinters[0]('https://user:pass@example.com/path?token=secret#hash'))
      .toBe('https://example.com/path');
    expect(initOptions.urlBlueprinters.networkUrlBlueprinters[0]('/api/media?id=123#preview'))
      .toBe('/api/media');
    expect(initOptions.urlBlueprinters.networkUrlBlueprinters[0]('?token=secret'))
      .toBe('');
    expect(initOptions.urlBlueprinters.networkUrlBlueprinters[0]('#token'))
      .toBe('');
    expect(initOptions.beforeSend({
      page_context: {
        page_url: 'https://user:pass@example.com/cms?token=secret#preview'
      },
      network_request_context: {
        url: '/api/media?id=123#preview'
      }
    })).toEqual({
      page_context: {
        page_url: 'https://example.com/cms'
      },
      network_request_context: {
        url: '/api/media'
      },
      labels: {
        plan: 'free',
        userRole: 'viewer',
        feature_area: 'board',
        releaseRing: 'stable',
        widgetCount: '0',
        isCollaborativeSession: 'false',
        integrationContext: 'whiteboard_only',
        network_effective_type: 'unknown'
      }
    });
  });

  it('disables soft navigation tracking when env is false', () => {
    window.__APP_CONFIG__ = {
      CORALOGIX_RUM_PUBLIC_KEY: 'public-rum-key',
      CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS: 'false'
    };

    expect(initializeCoralogixRum()).toBe(true);

    expect(CoralogixRum.init).toHaveBeenCalledWith(expect.objectContaining({
      trackSoftNavigations: false
    }));
  });

  it('resolveTrackSoftNavigations defaults to enabled', () => {
    expect(resolveTrackSoftNavigations({})).toBe(true);
    expect(resolveTrackSoftNavigations({ CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS: '1' })).toBe(true);
    expect(resolveTrackSoftNavigations({ CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS: 'false' })).toBe(false);
    expect(resolveTrackSoftNavigations({ CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS: '${CORALOGIX_RUM_TRACK_SOFT_NAVIGATIONS}' })).toBe(true);
  });

  it('uses default organization_name when config omits key', () => {
    window.__APP_CONFIG__ = {
      CORALOGIX_RUM_PUBLIC_KEY: 'public-rum-key'
    };

    expect(initializeCoralogixRum()).toBe(true);

    expect(CoralogixRum.init).toHaveBeenCalledWith(expect.objectContaining({
      labels: expect.objectContaining({
        organization_name: 'Acme Digital Works'
      })
    }));
  });

  it('uses configured organization_name override', () => {
    window.__APP_CONFIG__ = {
      CORALOGIX_RUM_PUBLIC_KEY: 'public-rum-key',
      CORALOGIX_ORGANIZATION_NAME: 'Northwind Studio'
    };

    expect(initializeCoralogixRum()).toBe(true);

    expect(CoralogixRum.init).toHaveBeenCalledWith(expect.objectContaining({
      labels: expect.objectContaining({
        organization_name: 'Northwind Studio'
      })
    }));
  });

  it('falls back to default organization_name for unresolved placeholder', () => {
    window.__APP_CONFIG__ = {
      CORALOGIX_RUM_PUBLIC_KEY: 'public-rum-key',
      CORALOGIX_ORGANIZATION_NAME: '${CORALOGIX_ORGANIZATION_NAME}'
    };

    expect(initializeCoralogixRum()).toBe(true);

    expect(CoralogixRum.init).toHaveBeenCalledWith(expect.objectContaining({
      labels: expect.objectContaining({
        organization_name: 'Acme Digital Works'
      })
    }));
  });

  it('always enables sessionRecordingConfig when RUM initializes', () => {
    window.__APP_CONFIG__ = {
      CORALOGIX_RUM_PUBLIC_KEY: 'public-rum-key',
      CORALOGIX_ENVIRONMENT: 'test'
    };

    expect(initializeCoralogixRum()).toBe(true);

    expect(CoralogixRum.init).toHaveBeenCalledWith(expect.objectContaining({
      sessionRecordingConfig: {
        enable: true,
        autoStartSessionRecording: true,
        recordConsoleEvents: true,
        sessionRecordingSampleRate: 100,
        recordCanvas: true
      }
    }));
  });

  it('honors CORALOGIX_RUM_SESSION_RECORDING_SAMPLE_RATE for session replay sampling', () => {
    window.__APP_CONFIG__ = {
      CORALOGIX_RUM_PUBLIC_KEY: 'public-rum-key',
      CORALOGIX_RUM_SESSION_RECORDING_SAMPLE_RATE: '50'
    };

    expect(initializeCoralogixRum()).toBe(true);

    expect(CoralogixRum.init).toHaveBeenCalledWith(expect.objectContaining({
      sessionRecordingConfig: expect.objectContaining({
        sessionRecordingSampleRate: 50
      })
    }));
  });

  it('does not pass sessionRecordingConfig when RUM is disabled', () => {
    expect(initializeCoralogixRum()).toBe(false);
    expect(CoralogixRum.init).not.toHaveBeenCalled();
  });

  it('only initializes SDK once', () => {
    window.__APP_CONFIG__ = {
      CORALOGIX_RUM_PUBLIC_KEY: 'public-rum-key'
    };

    expect(initializeCoralogixRum()).toBe(true);
    expect(initializeCoralogixRum()).toBe(true);

    expect(CoralogixRum.init).toHaveBeenCalledTimes(1);
  });

  it('rejects unresolved runtime placeholders and retries when key is available', () => {
    window.__APP_CONFIG__ = {
      CORALOGIX_RUM_PUBLIC_KEY: '${CORALOGIX_RUM_PUBLIC_KEY}'
    };

    expect(initializeCoralogixRum()).toBe(false);

    window.__APP_CONFIG__.CORALOGIX_RUM_PUBLIC_KEY = 'public-rum-key';

    expect(initializeCoralogixRum()).toBe(true);
    expect(CoralogixRum.init).toHaveBeenCalledTimes(1);
    expect(CoralogixRum.init).toHaveBeenCalledWith(expect.objectContaining({
      public_key: 'public-rum-key'
    }));
  });

  it('calls setUserContext for loadgen rum_user in production without allowProd', () => {
    const rumUser = {
      user_id: 'load-0-abc',
      user_name: 'Swift Heron',
      user_email: 'loaduser-0@rum-demo.invalid',
      user_metadata: { role: 'viewer', plan: 'free', loadgen: '1' }
    };

    window.__APP_CONFIG__ = {
      CORALOGIX_RUM_PUBLIC_KEY: 'public-rum-key',
      CORALOGIX_ENVIRONMENT: 'production'
    };

    expect(initializeCoralogixRum(window.__APP_CONFIG__, {
      demoEnabled: false,
      allowProd: false,
      showPanel: false,
      plan: 'free',
      version: 'dev',
      scenarioId: null,
      featureArea: 'board',
      releaseRing: 'stable',
      environment: 'production',
      rumUserContext: rumUser
    })).toBe(true);

    expect(CoralogixRum.setUserContext).toHaveBeenCalledTimes(1);
    expect(CoralogixRum.setUserContext).toHaveBeenCalledWith({
      user_id: 'load-0-abc',
      user_name: 'Swift Heron',
      user_email: 'loaduser-0@rum-demo.invalid',
      user_metadata: { role: 'viewer', plan: 'free', loadgen: '1' }
    });
  });

  it('calls setUserContext from whiteboard identity when rum_user is absent', () => {
    const storage = {
      store: {} as Record<string, string>,
      getItem(key: string) {
        return this.store[key] ?? null;
      },
      setItem(key: string, value: string) {
        this.store[key] = value;
      },
      removeItem(key: string) {
        delete this.store[key];
      },
      clear() {
        this.store = {};
      },
      key() {
        return null;
      },
      length: 0
    };

    storage.setItem(
      'whiteboard.identity',
      JSON.stringify({ userId: 'organic-1', displayName: 'Brave Owl', color: '#3b82f6' })
    );

    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });

    window.__APP_CONFIG__ = {
      CORALOGIX_RUM_PUBLIC_KEY: 'public-rum-key',
      CORALOGIX_ENVIRONMENT: 'production'
    };

    expect(initializeCoralogixRum()).toBe(true);

    expect(CoralogixRum.setUserContext).toHaveBeenCalledWith({
      user_id: 'organic-1',
      user_name: 'Brave Owl',
      user_metadata: { source: 'whiteboard' }
    });
  });

  it('calls setUserContext when rum_user loadgen payload is present', () => {
    const rumUser = {
      user_id: 'load-3-abc',
      user_name: 'Bold Otter',
      user_email: 'loaduser-3@rum-demo.invalid',
      user_metadata: { role: 'editor', plan: 'free', loadgen: '1' }
    };

    window.__APP_CONFIG__ = {
      CORALOGIX_RUM_PUBLIC_KEY: 'public-rum-key',
      CORALOGIX_ENVIRONMENT: 'test'
    };

    expect(initializeCoralogixRum(window.__APP_CONFIG__, {
      demoEnabled: false,
      allowProd: false,
      showPanel: false,
      plan: 'free',
      version: 'dev',
      scenarioId: null,
      featureArea: 'board',
      releaseRing: 'stable',
      environment: 'test',
      rumUserContext: rumUser
    })).toBe(true);

    expect(CoralogixRum.setUserContext).toHaveBeenCalledTimes(1);
    expect(CoralogixRum.setUserContext).toHaveBeenCalledWith({
      user_id: 'load-3-abc',
      user_name: 'Bold Otter',
      user_email: 'loaduser-3@rum-demo.invalid',
      user_metadata: { role: 'editor', plan: 'free', loadgen: '1' }
    });
  });

  it('resolveOtlpTracesUrl defaults to /v1/traces', () => {
    expect(resolveOtlpTracesUrl({})).toBe(DEFAULT_OTLP_TRACES_URL);
    expect(resolveOtlpTracesUrl({ CORALOGIX_OTLP_TRACES_URL: '/custom/traces' })).toBe('/custom/traces');
  });

  it('tracesExporter POSTs JSON to the configured OTLP endpoint', async () => {
    const exporter = createTracesExporter('/v1/traces');
    const payload = { resource_spans: [{ scope_spans: [] }] };

    exporter(payload as never);

    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledWith('/v1/traces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  });

  it.each([
    ['EU2', 'EU2'],
    ['eu2.coralogix.com', 'EU2'],
    ['us1.coralogix.com', 'US1'],
    ['us2.coralogix.com', 'US2'],
    ['us3.coralogix.com', 'US3'],
    ['ap1.coralogix.com', 'AP1'],
    ['ap2.coralogix.com', 'AP2'],
    ['ap3.coralogix.com', 'AP3'],
    ['ingress.eu1.coralogix.com', 'EU1'],
    ['unknown', 'EU1'],
    [undefined, 'EU1']
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeCoralogixDomain(input)).toBe(expected);
  });
});
