export interface PathGeometry {
  version: 1;
  kind: 'path';
  segments: [number, number][][];
}

export function parsePathGeometry(geometryJson: string | null): PathGeometry | null {
  if (!geometryJson) {
    return null;
  }

  const parsed = JSON.parse(geometryJson) as PathGeometry;
  if (parsed.version !== 1 || parsed.kind !== 'path' || !Array.isArray(parsed.segments)) {
    throw new Error('Invalid path geometry');
  }

  return parsed;
}

export function buildPath2D(geometry: PathGeometry, x: number, y: number, width: number, height: number): Path2D {
  const path = new Path2D();
  for (const segment of geometry.segments) {
    if (segment.length < 2) {
      continue;
    }

    const start = segment[0];
    const end = segment[1];
    if (!start || !end) {
      continue;
    }

    path.moveTo(x + start[0] * width, y + start[1] * height);
    path.lineTo(x + end[0] * width, y + end[1] * height);
  }

  return path;
}

export function pathGeometryCacheKey(geometryJson: string, x: number, y: number, width: number, height: number): string {
  return `${geometryJson}|${x}|${y}|${width}|${height}`;
}
