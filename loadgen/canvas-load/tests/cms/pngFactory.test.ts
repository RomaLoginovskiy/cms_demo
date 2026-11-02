import zlib from 'zlib';
import { generatePng } from '../../src/cms/pngFactory';
import { createRng } from '../../src/util/random';

describe('generatePng', () => {
  it('produces a valid RGB PNG of the requested size', () => {
    const png = generatePng(createRng(1), 64, 48);

    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(64);
    expect(png.readUInt32BE(20)).toBe(48);

    const idatLength = png.readUInt32BE(33);
    expect(png.subarray(37, 41).toString('ascii')).toBe('IDAT');
    const raw = zlib.inflateSync(png.subarray(41, 41 + idatLength));
    expect(raw.length).toBe((64 * 3 + 1) * 48);
    expect(png.subarray(png.length - 8, png.length - 4).toString('ascii')).toBe('IEND');
  });

  it('stays small enough for the cms-frontend nginx body limit', () => {
    expect(generatePng(createRng(7)).length).toBeLessThan(64 * 1024);
  });

  it('varies colours between calls', () => {
    const rng = createRng(3);
    expect(generatePng(rng).equals(generatePng(rng))).toBe(false);
  });
});
