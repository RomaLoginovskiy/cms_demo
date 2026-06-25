import { meshBBoxScale, parseMesh3DGeometry } from './meshGeometry';

describe('meshGeometry', () => {
  const geometryJson = JSON.stringify({
    version: 1,
    kind: 'mesh3d',
    vertices: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5]],
    faces: [[0, 1, 2]]
  });

  it('parses valid mesh geometry', () => {
    const geometry = parseMesh3DGeometry(geometryJson);
    expect(geometry?.faces).toHaveLength(1);
  });

  it('uses max width/height for uniform scale', () => {
    expect(meshBBoxScale(120, 80)).toBe(120);
    expect(meshBBoxScale(0, 0)).toBe(1);
  });
});
