import {
  applyWhiteboardIdentityToRum,
  parseRumUserParam,
  resetRumUserContextWarningsForTests,
  shouldApplyRumUserContext
} from './rumUserContext';
import { RumSessionConfig } from './rumSessionConfig';

function makeSessionConfig(overrides: Partial<RumSessionConfig> & Pick<RumSessionConfig, 'environment' | 'allowProd' | 'rumUserContext'>): RumSessionConfig {
  return {
    demoEnabled: false,
    showPanel: false,
    plan: 'free',
    version: 'dev',
    scenarioId: null,
    featureArea: 'board',
    releaseRing: 'stable',
    ...overrides
  };
}

function encodePayload(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

describe('rumUserContext', () => {
  beforeEach(() => {
    resetRumUserContextWarningsForTests();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses valid loadgen rum_user payload', () => {
    const encoded = encodePayload({
      user_id: 'load-1-deadbeef',
      user_name: 'Bold Otter',
      user_email: 'loaduser-1@rum-demo.invalid',
      user_metadata: { role: 'editor', plan: 'free', loadgen: '1' }
    });

    expect(parseRumUserParam(encoded)).toEqual({
      user_id: 'load-1-deadbeef',
      user_name: 'Bold Otter',
      user_email: 'loaduser-1@rum-demo.invalid',
      user_metadata: { role: 'editor', plan: 'free', loadgen: '1' }
    });
  });

  it('returns undefined for invalid payload', () => {
    expect(parseRumUserParam('not-valid')).toBeUndefined();
    expect(parseRumUserParam(encodePayload({ user_name: 'missing id' }))).toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it('applies loadgen user context outside production', () => {
    const config = makeSessionConfig({
      environment: 'test',
      allowProd: false,
      rumUserContext: {
        user_id: 'load-0-abc',
        user_metadata: { loadgen: '1' }
      }
    });

    expect(shouldApplyRumUserContext(config)).toBe(true);
  });

  it('allows loadgen user context in production without allowProd', () => {
    const config = makeSessionConfig({
      environment: 'production',
      allowProd: false,
      rumUserContext: {
        user_id: 'load-0-abc',
        user_metadata: { loadgen: '1' }
      }
    });

    expect(shouldApplyRumUserContext(config)).toBe(true);
  });

  it('applies whiteboard identity to RUM user context', () => {
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
      JSON.stringify({ userId: 'wb-user-1', displayName: 'Curious Fox', color: '#ef4444' })
    );

    const setUserContext = jest.fn();
    applyWhiteboardIdentityToRum(setUserContext, storage as Storage);

    expect(setUserContext).toHaveBeenCalledWith({
      user_id: 'wb-user-1',
      user_name: 'Curious Fox',
      user_metadata: { source: 'whiteboard' }
    });
  });

  it('skips payloads without loadgen marker', () => {
    const config = makeSessionConfig({
      environment: 'test',
      allowProd: false,
      rumUserContext: {
        user_id: 'manual-user',
        user_metadata: { role: 'admin' }
      }
    });

    expect(shouldApplyRumUserContext(config)).toBe(false);
  });
});
