import { buildPath2D, parsePathGeometry } from './pathGeometry';

describe('pathGeometry', () => {
  const geometryJson = JSON.stringify({
    version: 1,
    kind: 'path',
    segments: [[[0, 0], [1, 0]], [[0, 0], [0, 1]]]
  });

  it('parses valid path geometry', () => {
    const geometry = parsePathGeometry(geometryJson);
    expect(geometry?.segments).toHaveLength(2);
  });

  it('builds a Path2D for canvas rendering', () => {
    const geometry = parsePathGeometry(geometryJson);
    expect(geometry).not.toBeNull();
    const path = buildPath2D(geometry!, 10, 20, 100, 80);
    expect(path).toBeDefined();
  });
});
