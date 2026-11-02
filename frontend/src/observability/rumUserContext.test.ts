import {
  isLoadgenSyntheticUser,
  parseRumUserParam,
  resetRumUserContextWarningsForTests
} from './rumUserContext';

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
      user_id: 'load-3-ab12cd34',
      user_name: 'Calm Panda',
      user_email: 'loaduser-3@rum-demo.invalid',
      user_metadata: { role: 'editor', plan: 'free', loadgen: '1' }
    });

    expect(parseRumUserParam(encoded)).toEqual({
      user_id: 'load-3-ab12cd34',
      user_name: 'Calm Panda',
      user_email: 'loaduser-3@rum-demo.invalid',
      user_metadata: { role: 'editor', plan: 'free', loadgen: '1' }
    });
  });

  it('returns undefined for blank input without warning', () => {
    expect(parseRumUserParam(null)).toBeUndefined();
    expect(parseRumUserParam(undefined)).toBeUndefined();
    expect(parseRumUserParam('   ')).toBeUndefined();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('returns undefined for invalid payload', () => {
    expect(parseRumUserParam('not-valid')).toBeUndefined();
    expect(parseRumUserParam(encodePayload({ user_name: 'missing id' }))).toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it('rejects user_id longer than 128 characters', () => {
    expect(parseRumUserParam(encodePayload({ user_id: 'x'.repeat(129) }))).toBeUndefined();
  });

  it('truncates user_name and user_email and drops non-object metadata', () => {
    const parsed = parseRumUserParam(encodePayload({
      user_id: '  load-1  ',
      user_name: 'n'.repeat(200),
      user_email: 'e'.repeat(300),
      user_metadata: 'not-an-object'
    }));

    expect(parsed).toEqual({
      user_id: 'load-1',
      user_name: 'n'.repeat(128),
      user_email: 'e'.repeat(256)
    });
  });

  it('detects loadgen synthetic users by metadata marker', () => {
    expect(isLoadgenSyntheticUser({ user_id: 'a', user_metadata: { loadgen: '1' } })).toBe(true);
    expect(isLoadgenSyntheticUser({ user_id: 'a', user_metadata: { loadgen: 1 } })).toBe(true);
    expect(isLoadgenSyntheticUser({ user_id: 'a', user_metadata: { role: 'admin' } })).toBe(false);
    expect(isLoadgenSyntheticUser({ user_id: 'a' })).toBe(false);
  });
});
