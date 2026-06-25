import {
  buildRumQuery,
  buildUserQuery,
  resolveIntegrationContext
} from '../../src/rum/buildRumQuery';
import { buildRumSyntheticUser } from '../../src/rum/rumSyntheticUser';
import { createRng } from '../../src/util/random';

describe('buildRumQuery', () => {
  it('builds deterministic demo query strings', () => {
    expect(buildRumQuery({
      plan: 'enterprise',
      version: '1.95821',
      scenario: 's05',
      featureArea: 'board',
      releaseRing: 'canary',
      demoGeo: 'eu-west',
      demoBrowserFamily: 'chrome'
    })).toBe(
      'rumDemo=1&plan=enterprise&v=1.95821&scenario=s05&feature_area=board&ring=canary&geo=eu-west&browser=chrome'
    );
  });

  it('includes integration_context and batchId when set', () => {
    const query = buildRumQuery({
      plan: 'free',
      version: '1.95821',
      scenario: 's04',
      integrationContext: 'cms_media',
      batchId: 'run-42',
      widgetCountSeed: 500
    });

    expect(query).toContain('integration_context=cms_media');
    expect(query).toContain('batchId=run-42');
    expect(query).toContain('widgetCount=500');
  });

  it('appends rum_user when synthetic user is present', () => {
    const rumUser = buildRumSyntheticUser(2, 42, createRng(44));
    const query = buildRumQuery({
      plan: 'free',
      version: '1.95821',
      scenario: 's01',
      rumUser
    });

    expect(query).toContain('rumDemo=1');
    expect(query).toContain('scenario=s01');
    expect(query).toContain('rum_user=');
  });

  it('buildUserQuery emits rum_user and optional integration_context', () => {
    const rumUser = buildRumSyntheticUser(0, 1, createRng(1));
    const query = buildUserQuery(rumUser, { integrationContext: 'admin_api', batchId: 'run-1' });

    expect(query).toMatch(/^rum_user=/);
    expect(query).toContain('integration_context=admin_api');
    expect(query).toContain('batchId=run-1');
    expect(query).not.toContain('rumDemo');
  });

  it('maps behavior profiles to integration contexts', () => {
    expect(resolveIntegrationContext('media_placer')).toBe('cms_media');
    expect(resolveIntegrationContext('admin')).toBe('admin_api');
    expect(resolveIntegrationContext('collaborator')).toBe('whiteboard_only');
    expect(resolveIntegrationContext('lurker', 'custom_ctx')).toBe('custom_ctx');
  });
});
