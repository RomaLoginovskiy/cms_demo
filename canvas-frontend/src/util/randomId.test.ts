import { randomId } from './randomId';

describe('randomId', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true
    });
  });

  it('uses crypto.randomUUID when available', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => '00000000-0000-4000-8000-000000000099' },
      configurable: true
    });
    expect(randomId()).toBe('00000000-0000-4000-8000-000000000099');
  });

  it('falls back when randomUUID is missing', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: {},
      configurable: true
    });
    const id = randomId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});
