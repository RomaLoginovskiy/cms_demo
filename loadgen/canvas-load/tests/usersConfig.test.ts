import { normalizeUsers } from '../src/config/usersConfig';
import { defaultConfig } from '../src/config/defaults';

describe('usersConfig', () => {
  it('raises max_contexts when count exceeds it', () => {
    const users = { ...defaultConfig.users, count: 150, max_contexts_per_pod: 30 };
    normalizeUsers(users);
    expect(users.max_contexts_per_pod).toBe(150);
    expect(users.count).toBe(150);
  });

  it('allows very large user counts', () => {
    const users = { ...defaultConfig.users, count: 10_000, max_contexts_per_pod: 10_000 };
    normalizeUsers(users);
    expect(users.count).toBe(10_000);
    expect(users.max_contexts_per_pod).toBe(10_000);
  });
});
