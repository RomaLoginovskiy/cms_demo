import { defaultConfig } from '../src/config/defaults';
import { validateMergedConfig } from '../src/config/applyConfig';
import { normalizeUsers } from '../src/config/usersConfig';
import { LoadConfig } from '../src/config/types';

describe('control config apply', () => {
  it('accepts user count above stale max_contexts_per_pod (500 vs 50)', () => {
    const base = JSON.parse(JSON.stringify(defaultConfig)) as LoadConfig;
    base.users = { count: 10, max_contexts_per_pod: 50, think_time_ms: 100 };

    const { preview, errors } = validateMergedConfig(base, {
      users: { count: 500, max_contexts_per_pod: 50, think_time_ms: 100 }
    });

    expect(errors).toHaveLength(0);
    expect(preview.users.count).toBe(500);
    expect(preview.users.max_contexts_per_pod).toBe(500);
  });

  it('accepts large user counts', () => {
    const base = JSON.parse(JSON.stringify(defaultConfig)) as LoadConfig;

    const { preview, errors } = validateMergedConfig(base, {
      users: { count: 2500, max_contexts_per_pod: 2500, think_time_ms: 100 }
    });

    expect(errors).toHaveLength(0);
    expect(preview.users.count).toBe(2500);
    expect(preview.users.max_contexts_per_pod).toBe(2500);
  });

  it('matches engine merge when only count is sent from UI', () => {
    const base = JSON.parse(JSON.stringify(defaultConfig)) as LoadConfig;
    base.users.max_contexts_per_pod = 50;

    const { preview } = validateMergedConfig(base, {
      users: { count: 800, max_contexts_per_pod: 800, think_time_ms: 100 }
    });

    const engineStyle = JSON.parse(JSON.stringify(base)) as LoadConfig;
    Object.assign(engineStyle.users, { count: 800, max_contexts_per_pod: 800, think_time_ms: 100 });
    normalizeUsers(engineStyle.users);

    expect(preview.users).toEqual(engineStyle.users);
  });

  it('merges session_pacing from UI partial without dropping defaults', () => {
    const base = JSON.parse(JSON.stringify(defaultConfig)) as LoadConfig;

    const { preview, errors } = validateMergedConfig(base, {
      users: {
        session_pacing: {
          enabled: true,
          long_fraction: 0.25
        }
      }
    });

    expect(errors).toHaveLength(0);
    expect(preview.users.session_pacing.enabled).toBe(true);
    expect(preview.users.session_pacing.long_fraction).toBe(0.25);
    expect(preview.users.session_pacing.long_think_multiplier).toBe(3);
    expect(preview.users.session_pacing.long_profile_max_duration_ms).toBe(720_000);
  });

  it('rejects invalid session_pacing when enabled', () => {
    const base = JSON.parse(JSON.stringify(defaultConfig)) as LoadConfig;

    const { errors } = validateMergedConfig(base, {
      users: {
        session_pacing: {
          enabled: true,
          long_fraction: 1.5
        }
      }
    });

    expect(errors.some(e => e.includes('long_fraction'))).toBe(true);
  });
});
