import {
  initRumLabelContext,
  resetRumLabelContextForTests,
  setBoardIdHash,
  setCollaborativeSession,
  getRumLabelSnapshot
} from './rumLabelContext';
import { parseRumSessionConfig } from './rumSessionConfig';

describe('rumLabelContext', () => {
  beforeEach(() => {
    resetRumLabelContextForTests();
    window.__APP_CONFIG__ = { CORALOGIX_ENVIRONMENT: 'test' };
  });

  it('promotes userRole from rum_user metadata', () => {
    const rumUser = {
      user_id: 'load-1',
      user_metadata: { role: 'editor', loadgen: '1' }
    };
    const encoded = Buffer.from(JSON.stringify(rumUser), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    initRumLabelContext(parseRumSessionConfig(window.__APP_CONFIG__, `?rum_user=${encoded}`));
    expect(getRumLabelSnapshot().userRole).toBe('editor');
  });

  it('hashes board id to 12 hex chars', async () => {
    initRumLabelContext(parseRumSessionConfig(window.__APP_CONFIG__, ''));
    setBoardIdHash('board-abc-123');
    await new Promise(resolve => setTimeout(resolve, 0));
    const hash = getRumLabelSnapshot().boardId_hash;
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('coerces collaborative session to string labels', () => {
    initRumLabelContext(parseRumSessionConfig(window.__APP_CONFIG__, ''));
    setCollaborativeSession(true);
    expect(getRumLabelSnapshot().isCollaborativeSession).toBe('true');
    setCollaborativeSession(false);
    expect(getRumLabelSnapshot().isCollaborativeSession).toBe('false');
  });

  it('honors collab URL override over presence updates', () => {
    initRumLabelContext(parseRumSessionConfig(window.__APP_CONFIG__, '?collab=1'));
    setCollaborativeSession(false);
    expect(getRumLabelSnapshot().isCollaborativeSession).toBe('true');
  });

  it('parses integration_context from session config', () => {
    initRumLabelContext(parseRumSessionConfig(window.__APP_CONFIG__, '?integration_context=cms_media'));
    expect(getRumLabelSnapshot().integrationContext).toBe('cms_media');
  });
});
