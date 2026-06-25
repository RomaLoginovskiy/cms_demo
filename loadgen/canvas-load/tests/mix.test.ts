import { pickProfileForTest } from '../src/behaviors/profilePicker';

describe('profile mix', () => {
  it('distributes roughly by weight', () => {
    const mix = { lurker: 0.5, active_drawer: 0.5, collaborator: 0, admin: 0, media_placer: 0 };
    const counts: Record<string, number> = {};
    let seed = 0;
    const rng = () => {
      seed = (seed + 0.123456789) % 1;
      return seed;
    };
    for (let i = 0; i < 10000; i++) {
      const p = pickProfileForTest(mix, rng);
      counts[p] = (counts[p] ?? 0) + 1;
    }
    expect(counts.lurker).toBeGreaterThan(4000);
    expect(counts.active_drawer).toBeGreaterThan(4000);
  });
});
