import {
  coerceTargetUrl,
  resolveTargetUrl,
  CLUSTER_DEFAULT
} from '../src/config/resolveTargetUrl';
import { defaultConfig } from '../src/config/defaults';

describe('resolveTargetUrl', () => {
  const originalK8s = process.env.KUBERNETES_SERVICE_HOST;
  const originalInCluster = process.env.CANVAS_LOAD_IN_CLUSTER;

  afterEach(() => {
    if (originalK8s === undefined) delete process.env.KUBERNETES_SERVICE_HOST;
    else process.env.KUBERNETES_SERVICE_HOST = originalK8s;
    if (originalInCluster === undefined) delete process.env.CANVAS_LOAD_IN_CLUSTER;
    else process.env.CANVAS_LOAD_IN_CLUSTER = originalInCluster;
  });

  it('uses configured URL when not in cluster', () => {
    delete process.env.KUBERNETES_SERVICE_HOST;
    delete process.env.CANVAS_LOAD_IN_CLUSTER;
    const cfg = JSON.parse(JSON.stringify(defaultConfig)) as typeof defaultConfig;
    cfg.target.frontend_base_url = 'http://localhost:3000';
    const result = resolveTargetUrl(cfg);
    expect(result.url).toBe('http://localhost:3000');
    expect(result.source).toBe('config');
  });

  it('rewrites localhost:3000 to canvas-frontend in kubernetes', () => {
    process.env.KUBERNETES_SERVICE_HOST = '10.96.0.1';
    const cfg = JSON.parse(JSON.stringify(defaultConfig)) as typeof defaultConfig;
    cfg.target.frontend_base_url = 'http://localhost:3000';
    const result = resolveTargetUrl(cfg);
    expect(result.url).toBe(CLUSTER_DEFAULT);
    expect(result.source).toBe('kubernetes');
    expect(result.rewrittenFrom).toBe('http://localhost:3000');
  });

  it('coerceTargetUrl rewrites localhost when CANVAS_LOAD_IN_CLUSTER is set', () => {
    delete process.env.KUBERNETES_SERVICE_HOST;
    process.env.CANVAS_LOAD_IN_CLUSTER = 'true';
    expect(coerceTargetUrl('http://localhost:3000')).toBe(CLUSTER_DEFAULT);
  });
});
