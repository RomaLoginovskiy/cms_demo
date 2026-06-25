export interface Mesh3DGeometry {
  version: 1;
  kind: 'mesh3d';
  vertices: [number, number, number][];
  faces: [number, number, number][];
}

export function parseMesh3DGeometry(geometryJson: string | null): Mesh3DGeometry | null {
  if (!geometryJson) {
    return null;
  }

  const parsed = JSON.parse(geometryJson) as Mesh3DGeometry;
  if (parsed.version !== 1 || parsed.kind !== 'mesh3d' || !Array.isArray(parsed.vertices) || !Array.isArray(parsed.faces)) {
    throw new Error('Invalid mesh3d geometry');
  }

  return parsed;
}

export function meshBBoxScale(width: number, height: number): number {
  return Math.max(Math.abs(width), Math.abs(height), 1);
}
