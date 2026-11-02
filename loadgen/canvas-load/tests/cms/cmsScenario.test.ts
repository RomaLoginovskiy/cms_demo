import { pickProfile } from '../../src/behaviors/profilePicker';
import { defaultConfig } from '../../src/config/defaults';
import { resolveTargetUrl, applyResolvedTarget, coerceTargetUrl } from '../../src/config/resolveTargetUrl';
import { applyScenarioSafe } from '../../src/config/scenarios';
import { LoadConfig } from '../../src/config/types';
import { validateConfig } from '../../src/config/validate';

const CMS_PROFILES = ['cms_uploader', 'cms_curator', 'cms_browser'];

function clone(): LoadConfig {
  return JSON.parse(JSON.stringify(defaultConfig)) as LoadConfig;
}

function mixSum(cfg: LoadConfig): number {
  return Object.values(cfg.profiles.mix).reduce((a, b) => a + b, 0);
}

describe('cms scenario', () => {
  const originalInCluster = process.env.CANVAS_LOAD_IN_CLUSTER;
  const originalK8s = process.env.KUBERNETES_SERVICE_HOST;

  afterEach(() => {
    if (originalInCluster === undefined) delete process.env.CANVAS_LOAD_IN_CLUSTER;
    else process.env.CANVAS_LOAD_IN_CLUSTER = originalInCluster;
    if (originalK8s === undefined) delete process.env.KUBERNETES_SERVICE_HOST;
    else process.env.KUBERNETES_SERVICE_HOST = originalK8s;
  });

  it('switches to a CMS-only mix that validates', () => {
    const cfg = clone();
    applyScenarioSafe(cfg, 'cms');

    expect(cfg.target.app).toBe('cms');
    expect(mixSum(cfg)).toBeCloseTo(1, 5);
    for (const [name, weight] of Object.entries(cfg.profiles.mix)) {
      if (!CMS_PROFILES.includes(name)) expect(weight).toBe(0);
    }
    expect(cfg.chaos.enabled).toBe(false);
    expect(validateConfig(cfg)).toEqual([]);
  });

  it('switches back to canvas with a valid mix', () => {
    const cfg = clone();
    applyScenarioSafe(cfg, 'cms');
    applyScenarioSafe(cfg, 'canvas');

    expect(cfg.target.app).toBe('canvas');
    expect(mixSum(cfg)).toBeCloseTo(1, 5);
    for (const name of CMS_PROFILES) expect(cfg.profiles.mix[name]).toBe(0);
  });

  it('rewrites a localhost CMS target to the cms-frontend service in cluster', () => {
    process.env.CANVAS_LOAD_IN_CLUSTER = 'true';
    const cfg = clone();
    applyScenarioSafe(cfg, 'cms');

    expect(resolveTargetUrl(cfg).url).toBe('http://cms-frontend/cms');
    applyResolvedTarget(cfg);
    expect(cfg.target.cms_probe_url).toBe('http://cms-frontend/api/media');
    expect(coerceTargetUrl('http://localhost', 'canvas')).toBe('http://canvas-frontend');
  });

  it('keeps the /cms path outside the cluster', () => {
    delete process.env.CANVAS_LOAD_IN_CLUSTER;
    delete process.env.KUBERNETES_SERVICE_HOST;
    const cfg = clone();
    applyScenarioSafe(cfg, 'cms');
    applyResolvedTarget(cfg);

    expect(cfg.target.frontend_base_url).toBe('http://localhost/cms');
    expect(cfg.target.cms_probe_url).toBe('http://localhost/api/media');
  });

  it('never picks a canvas profile from a CMS-only mix, even past the last weight', () => {
    const cfg = clone();
    applyScenarioSafe(cfg, 'cms');
    cfg.profiles.mix.cms_browser = 0.29; // sum 0.99 — rolls above it hit the fallback

    for (const roll of [0, 0.1, 0.5, 0.95, 0.999]) {
      expect(CMS_PROFILES).toContain(pickProfile(cfg, () => roll));
    }
  });
});
