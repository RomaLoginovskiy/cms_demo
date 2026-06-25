import {
  resolveBrowserFingerprint,
  GEO_LABELS,
  BROWSER_FAMILIES
} from '../../src/rum/browserFingerprint';
import { createRng } from '../../src/util/random';

describe('browserFingerprint', () => {
  it('produces different fingerprints for adjacent user indices', () => {
    const seed = 42;
    const fp0 = resolveBrowserFingerprint({ seed, userIndex: 0, rng: createRng(seed) });
    const fp1 = resolveBrowserFingerprint({ seed, userIndex: 1, rng: createRng(seed + 1) });
    const fp2 = resolveBrowserFingerprint({ seed, userIndex: 2, rng: createRng(seed + 2) });

    const keys = (fp: typeof fp0) =>
      `${fp.demoGeo}|${fp.demoBrowserFamily}|${fp.viewport.width}x${fp.viewport.height}|${fp.locale}`;

    expect(keys(fp0)).not.toBe(keys(fp1));
    expect(keys(fp1)).not.toBe(keys(fp2));
  });

  it('is stable for the same seed and userIndex', () => {
    const seed = 99;
    const userIndex = 7;
    const rngA = createRng(seed + userIndex);
    const rngB = createRng(seed + userIndex);

    const a = resolveBrowserFingerprint({ seed, userIndex, rng: rngA });
    const b = resolveBrowserFingerprint({ seed, userIndex, rng: rngB });

    expect(a).toEqual(b);
  });

  it('honors pinned geo and browser overrides', () => {
    const fp = resolveBrowserFingerprint({
      seed: 1,
      userIndex: 0,
      rng: createRng(1),
      overrides: { demoGeo: 'us-east', demoBrowserFamily: 'firefox' }
    });

    expect(fp.demoGeo).toBe('us-east');
    expect(fp.demoBrowserFamily).toBe('firefox');
    expect(fp.geolocation).toEqual({ latitude: 40.71, longitude: -74.01 });
    expect(fp.userAgent).toContain('Firefox');
  });

  it('uses only known geo labels and browser families when not overridden', () => {
    for (let i = 0; i < 20; i += 1) {
      const fp = resolveBrowserFingerprint({
        seed: 5,
        userIndex: i,
        rng: createRng(5 + i)
      });
      expect(GEO_LABELS).toContain(fp.demoGeo);
      expect(BROWSER_FAMILIES).toContain(fp.demoBrowserFamily);
      expect(fp.locale.length).toBeGreaterThan(0);
      expect(fp.timezoneId.length).toBeGreaterThan(0);
    }
  });
});
