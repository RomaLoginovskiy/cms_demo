import { defaultConfig } from '../src/config/defaults';
import {
  applyThinkMultiplier,
  resolveSessionPacing
} from '../src/engine/sessionPacing';
import { LoadConfig } from '../src/config/types';

function configWithPacing(overrides: Partial<LoadConfig['users']['session_pacing']>): LoadConfig {
  const cfg = JSON.parse(JSON.stringify(defaultConfig)) as LoadConfig;
  cfg.users.session_pacing = { ...cfg.users.session_pacing, enabled: true, ...overrides };
  return cfg;
}

describe('resolveSessionPacing', () => {
  it('returns null when disabled', () => {
    const cfg = JSON.parse(JSON.stringify(defaultConfig)) as LoadConfig;
    expect(resolveSessionPacing(cfg, 0)).toBeNull();
  });

  it('is deterministic for seed and userIndex', () => {
    const cfg = configWithPacing({ long_fraction: 0.5 });
    const a = resolveSessionPacing(cfg, 3);
    const b = resolveSessionPacing(cfg, 3);
    expect(a).toEqual(b);
  });

  it('assigns long tier with long duration and multiplier', () => {
    const cfg = configWithPacing({
      long_fraction: 1,
      long_think_multiplier: 3,
      normal_profile_max_duration_ms: 60_000,
      long_profile_max_duration_ms: 600_000
    });
    const assignment = resolveSessionPacing(cfg, 0);
    expect(assignment).toEqual({
      tier: 'long',
      thinkMultiplier: 3,
      profileMaxDurationMs: 600_000
    });
  });

  it('assigns normal tier with normal duration', () => {
    const cfg = configWithPacing({
      long_fraction: 0,
      normal_profile_max_duration_ms: 120_000,
      long_profile_max_duration_ms: 600_000
    });
    const assignment = resolveSessionPacing(cfg, 0);
    expect(assignment).toEqual({
      tier: 'normal',
      thinkMultiplier: 1,
      profileMaxDurationMs: 120_000
    });
  });

  it('long_fraction produces approximate share across users', () => {
    const cfg = configWithPacing({ long_fraction: 0.25 });
    let longCount = 0;
    for (let i = 0; i < 400; i++) {
      if (resolveSessionPacing(cfg, i)?.tier === 'long') longCount++;
    }
    expect(longCount).toBeGreaterThan(60);
    expect(longCount).toBeLessThan(140);
  });
});

describe('applyThinkMultiplier', () => {
  it('returns same config when pacing is null', () => {
    const cfg = JSON.parse(JSON.stringify(defaultConfig)) as LoadConfig;
    expect(applyThinkMultiplier(cfg, null)).toBe(cfg);
  });

  it('scales think_time_ms for long tier', () => {
    const cfg = JSON.parse(JSON.stringify(defaultConfig)) as LoadConfig;
    cfg.users.think_time_ms = 100;
    const scaled = applyThinkMultiplier(cfg, {
      tier: 'long',
      thinkMultiplier: 2.5,
      profileMaxDurationMs: 600_000
    });
    expect(scaled.users.think_time_ms).toBe(250);
  });
});
