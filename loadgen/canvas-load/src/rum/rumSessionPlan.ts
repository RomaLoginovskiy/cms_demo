import { LoadConfig } from '../config/types';
import { resolveBrowserFingerprint } from './browserFingerprint';
import { RumSessionAssignment } from './buildRumQuery';

export interface RumBatchMatrixRow {
  plan: 'free' | 'enterprise' | 'team';
  v: string;
  scenario: string;
  count: number;
  featureArea?: string;
  releaseRing?: string;
  demoGeo?: string;
  demoBrowserFamily?: string;
  integrationContext?: string;
  widgetCountSeed?: number;
}

const GEO_SAMPLES = ['eu-west', 'us-east', 'ap-south'];
const BROWSER_FAMILIES = ['chrome', 'firefox', 'safari'];

function withFingerprintDiversity<T extends RumBatchMatrixRow>(
  rows: Array<Omit<T, 'demoGeo' | 'demoBrowserFamily'> & Partial<Pick<T, 'demoGeo' | 'demoBrowserFamily'>>>
): RumBatchMatrixRow[] {
  return rows.map((row, index) => ({
    ...row,
    demoGeo: row.demoGeo ?? GEO_SAMPLES[index % GEO_SAMPLES.length],
    demoBrowserFamily: row.demoBrowserFamily ?? BROWSER_FAMILIES[index % BROWSER_FAMILIES.length]
  }));
}

const PRESETS: Record<string, RumBatchMatrixRow[]> = {
  uc1_critical_spike: Array.from({ length: 50 }, (_, index) => ({
    plan: 'free' as const,
    v: '1.95821',
    scenario: 's01',
    count: 1,
    demoGeo: GEO_SAMPLES[index % GEO_SAMPLES.length],
    demoBrowserFamily: BROWSER_FAMILIES[index % BROWSER_FAMILIES.length]
  })),
  uc2_plan_mix: withFingerprintDiversity([
    ...Array.from({ length: 40 }, () => ({ plan: 'free' as const, v: '1.95821', scenario: 's04', count: 1 })),
    ...Array.from({ length: 10 }, () => ({ plan: 'enterprise' as const, v: '1.95821', scenario: 's05', count: 1 }))
  ]),
  uc4_version_ab: withFingerprintDiversity([
    ...Array.from({ length: 25 }, () => ({ plan: 'free' as const, v: '1.92903', scenario: 's09', count: 1 })),
    ...Array.from({ length: 25 }, () => ({ plan: 'enterprise' as const, v: '1.95821', scenario: 's09', count: 1 }))
  ])
};

export function resolveRumBatchMatrix(config: LoadConfig): RumBatchMatrixRow[] {
  const rumBatch = config.rum_batch;
  if (!rumBatch?.enabled) {
    return [];
  }
  if (rumBatch.preset && PRESETS[rumBatch.preset]) {
    return PRESETS[rumBatch.preset];
  }
  return rumBatch.matrix ?? [];
}

export function resolveRumSessionForUser(
  config: LoadConfig,
  userIndex: number,
  rng: () => number
): RumSessionAssignment | null {
  const matrix = resolveRumBatchMatrix(config);
  if (matrix.length === 0) {
    return null;
  }

  const expanded: RumBatchMatrixRow[] = [];
  matrix.forEach(row => {
    for (let i = 0; i < row.count; i += 1) {
      expanded.push(row);
    }
  });

  const row = expanded[userIndex % expanded.length];
  const fingerprint = resolveBrowserFingerprint({
    seed: config.run.seed,
    userIndex,
    rng,
    overrides: {
      demoGeo: row.demoGeo,
      demoBrowserFamily: row.demoBrowserFamily
    },
    fallbackViewport: {
      width: config.browser.viewport_width,
      height: config.browser.viewport_height
    }
  });

  return {
    plan: row.plan,
    version: row.v,
    scenario: row.scenario,
    featureArea: row.featureArea ?? 'board',
    releaseRing: row.releaseRing ?? 'stable',
    demoGeo: fingerprint.demoGeo,
    demoBrowserFamily: fingerprint.demoBrowserFamily,
    integrationContext: row.integrationContext,
    widgetCountSeed: row.widgetCountSeed,
    geolocation: fingerprint.geolocation,
    userAgent: fingerprint.userAgent,
    locale: fingerprint.locale,
    timezoneId: fingerprint.timezoneId,
    viewport: fingerprint.viewport
  };
}
