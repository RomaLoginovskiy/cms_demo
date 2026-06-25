import {
  buildSessionQuery,
  isRumDemoInjectorsAllowed,
  parseRumSessionConfig
} from './rumSessionConfig';

describe('rumSessionConfig', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.__APP_CONFIG__ = {
      CORALOGIX_APP_VERSION: '1.92903',
      CORALOGIX_ENVIRONMENT: 'test'
    };
  });

  it('parses URL params for plan, version, and scenario', () => {
    const config = parseRumSessionConfig(
      window.__APP_CONFIG__,
      '?rumDemo=1&plan=enterprise&v=1.95821&scenario=s05&ring=canary&feature_area=board'
    );

    expect(config.demoEnabled).toBe(true);
    expect(config.plan).toBe('enterprise');
    expect(config.version).toBe('1.95821');
    expect(config.scenarioId).toBe('s05');
    expect(config.releaseRing).toBe('canary');
    expect(config.featureArea).toBe('board');
  });

  it('builds symmetric query strings for loadgen', () => {
    const query = buildSessionQuery({
      plan: 'free',
      version: '1.95821',
      scenarioId: 's04',
      releaseRing: 'stable',
      featureArea: 'board',
      integrationContext: 'cms_media',
      collabOverride: true
    });

    expect(query).toContain('rumDemo=1');
    expect(query).toContain('plan=free');
    expect(query).toContain('v=1.95821');
    expect(query).toContain('scenario=s04');
    expect(query).toContain('integration_context=cms_media');
    expect(query).toContain('collab=1');
  });

  it('parses integration_context and collab override params', () => {
    const config = parseRumSessionConfig(
      window.__APP_CONFIG__,
      '?integration_context=admin_api&collab=0'
    );

    expect(config.integrationContext).toBe('admin_api');
    expect(config.collabOverride).toBe(false);
  });

  it('parses rum_user from URL into session config', () => {
    const rumUser = {
      user_id: 'load-5-abc',
      user_name: 'Swift Heron',
      user_email: 'loaduser-5@rum-demo.invalid',
      user_metadata: { role: 'admin', loadgen: '1' }
    };
    const encoded = Buffer.from(JSON.stringify(rumUser), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    const config = parseRumSessionConfig(
      window.__APP_CONFIG__,
      `?rum_user=${encoded}`
    );

    expect(config.rumUserContext).toEqual(rumUser);
  });

  it('blocks demo injectors in production without allow flag', () => {
    const config = parseRumSessionConfig(
      { CORALOGIX_ENVIRONMENT: 'production', RUM_DEMO_ALLOW_PROD: 'false' },
      '?rumDemo=1&scenario=s01'
    );

    expect(config.demoEnabled).toBe(true);
    expect(isRumDemoInjectorsAllowed(config)).toBe(false);
  });

  it('allows demo injectors in production when explicitly allowed', () => {
    const config = parseRumSessionConfig(
      { CORALOGIX_ENVIRONMENT: 'production', RUM_DEMO_ALLOW_PROD: 'true' },
      '?rumDemo=1&scenario=s01'
    );

    expect(isRumDemoInjectorsAllowed(config)).toBe(true);
  });
});
