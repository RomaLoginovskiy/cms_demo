import { buildRumBatchForPreset, buildRumBatchForScenario, buildDisabledRumBatch } from '../../src/rum/rumControl';

describe('rumControl', () => {
  it('builds uniform matrix for a single scenario', () => {
    const batch = buildRumBatchForScenario('s05', { plan: 'enterprise', version: '1.95821' });
    expect(batch?.enabled).toBe(true);
    expect(batch?.matrix).toHaveLength(1);
    expect(batch?.matrix?.[0]).toMatchObject({
      scenario: 's05',
      plan: 'enterprise',
      v: '1.95821',
      count: 1
    });
  });

  it('does not pin geo or browser on single-scenario matrix rows', () => {
    const batch = buildRumBatchForScenario('s01');
    expect(batch?.matrix?.[0]?.demoGeo).toBeUndefined();
    expect(batch?.matrix?.[0]?.demoBrowserFamily).toBeUndefined();
  });

  it('builds batch preset config', () => {
    const batch = buildRumBatchForPreset('uc1_critical_spike');
    expect(batch?.enabled).toBe(true);
    expect(batch?.preset).toBe('uc1_critical_spike');
  });

  it('disables rum batch', () => {
    expect(buildDisabledRumBatch()?.enabled).toBe(false);
  });
});
