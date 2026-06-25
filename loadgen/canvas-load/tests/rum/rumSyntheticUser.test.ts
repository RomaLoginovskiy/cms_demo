import { createRng } from '../../src/util/random';
import {
  buildRumSyntheticUser,
  encodeRumUserParam
} from '../../src/rum/rumSyntheticUser';

describe('rumSyntheticUser', () => {
  it('builds deterministic users for fixed seed and userIndex', () => {
    const rngA = createRng(42 + 7);
    const rngB = createRng(42 + 7);

    const userA = buildRumSyntheticUser(7, 42, rngA);
    const userB = buildRumSyntheticUser(7, 42, rngB);

    expect(userA).toEqual(userB);
    expect(userA.user_id).toMatch(/^load-7-[0-9a-f]{8}$/);
    expect(userA.user_email).toBe('loaduser-7@rum-demo.invalid');
    expect(userA.user_metadata.loadgen).toBe('1');
    expect(userA.user_metadata.plan).toBe('free');
  });

  it('echoes rum_batch plan and scenario in metadata', () => {
    const rng = createRng(1);
    const user = buildRumSyntheticUser(3, 99, rng, {
      plan: 'enterprise',
      scenario: 's05'
    });

    expect(user.user_metadata.plan).toBe('enterprise');
    expect(user.user_metadata.scenario).toBe('s05');
  });

  it('encodes payload as base64url JSON', () => {
    const user = buildRumSyntheticUser(0, 1, createRng(1));
    const encoded = encodeRumUserParam(user);

    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');

    const json = Buffer.from(
      encoded.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8');
    expect(JSON.parse(json)).toEqual(user);
  });
});
