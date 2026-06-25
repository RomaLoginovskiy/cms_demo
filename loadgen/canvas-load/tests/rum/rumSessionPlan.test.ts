import { defaultConfig } from '../../src/config/defaults';
import { LoadConfig } from '../../src/config/types';
import { resolveRumSessionForUser } from '../../src/rum/rumSessionPlan';
import { createRng } from '../../src/util/random';

function configWithPreset(preset: string, userCount = 50): LoadConfig {
  return {
    ...defaultConfig,
    users: { ...defaultConfig.users, count: userCount },
    rum_batch: {
      enabled: true,
      preset,
      append_to_all_navigations: true,
      matrix: []
    }
  };
}

describe('rumSessionPlan', () => {
  it('uc2_plan_mix yields diverse demoGeo and locale across first 10 users', () => {
    const config = configWithPreset('uc2_plan_mix');
    const geos = new Set<string>();
    const locales = new Set<string>();

    for (let i = 0; i < 10; i += 1) {
      const assignment = resolveRumSessionForUser(config, i, createRng(config.run.seed + i));
      expect(assignment).not.toBeNull();
      geos.add(assignment!.demoGeo!);
      locales.add(assignment!.locale!);
      expect(assignment!.userAgent).toBeTruthy();
      expect(assignment!.geolocation).toBeTruthy();
    }

    expect(geos.size).toBeGreaterThanOrEqual(3);
    expect(locales.size).toBeGreaterThan(1);
  });

  it('uc4_version_ab yields diverse demoGeo across first 10 users', () => {
    const config = configWithPreset('uc4_version_ab');
    const geos = new Set<string>();

    for (let i = 0; i < 10; i += 1) {
      const assignment = resolveRumSessionForUser(config, i, createRng(config.run.seed + i));
      geos.add(assignment!.demoGeo!);
    }

    expect(geos.size).toBeGreaterThanOrEqual(3);
  });

  it('single-scenario matrix fills per-user geo when row omits demoGeo', () => {
    const config: LoadConfig = {
      ...defaultConfig,
      rum_batch: {
        enabled: true,
        append_to_all_navigations: true,
        matrix: [{ plan: 'free', v: '1.95821', scenario: 's01', count: 1 }]
      }
    };

    const a0 = resolveRumSessionForUser(config, 0, createRng(1));
    const a1 = resolveRumSessionForUser(config, 1, createRng(2));

    expect(a0!.demoGeo).toBeTruthy();
    expect(a1!.demoGeo).toBeTruthy();
    expect(a0!.demoGeo).not.toBe(a1!.demoGeo);
  });
});
