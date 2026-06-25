import { PathGeometry } from '../geometry/pathGeometry';
import { Mesh3DGeometry } from '../geometry/meshGeometry';
import { Mesh3DTemplate, PathTemplate, ShapeTemplate } from './types';

function crossSegments(): PathGeometry['segments'] {
  return [
    [[0.2, 0.5], [0.8, 0.5]],
    [[0.5, 0.2], [0.5, 0.8]],
    [[0.25, 0.25], [0.75, 0.75]],
    [[0.75, 0.25], [0.25, 0.75]]
  ];
}

function gearSegments(teeth: number): PathGeometry['segments'] {
  const segments: PathGeometry['segments'] = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.35) / teeth) * Math.PI * 2;
    const a2 = ((i + 0.5) / teeth) * Math.PI * 2;
    const inner = 0.35;
    const outer = 0.48;
    segments.push([
      [0.5 + Math.cos(a0) * inner, 0.5 + Math.sin(a0) * inner],
      [0.5 + Math.cos(a1) * outer, 0.5 + Math.sin(a1) * outer]
    ]);
    segments.push([
      [0.5 + Math.cos(a1) * outer, 0.5 + Math.sin(a1) * outer],
      [0.5 + Math.cos(a2) * inner, 0.5 + Math.sin(a2) * inner]
    ]);
  }

  return segments;
}

function stressGridSegments(grid: number): PathGeometry['segments'] {
  const segments: PathGeometry['segments'] = [];
  for (let i = 0; i <= grid; i++) {
    const t = i / grid;
    segments.push([[t, 0], [t, 1]]);
    segments.push([[0, t], [1, t]]);
  }

  return segments;
}

function cubeMesh(): Mesh3DGeometry {
  const vertices: Mesh3DGeometry['vertices'] = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]
  ];
  const faces: Mesh3DGeometry['faces'] = [
    [0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6],
    [0, 4, 5], [0, 5, 1], [2, 6, 7], [2, 7, 3],
    [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2]
  ];
  return { version: 1, kind: 'mesh3d', vertices, faces };
}

function subdividedCube(divisions: number): Mesh3DGeometry {
  const vertices: [number, number, number][] = [];
  const faces: [number, number, number][] = [];
  const index = (x: number, y: number, z: number) => x + y * (divisions + 1) + z * (divisions + 1) ** 2;

  for (let z = 0; z <= divisions; z++) {
    for (let y = 0; y <= divisions; y++) {
      for (let x = 0; x <= divisions; x++) {
        vertices.push([
          -0.5 + x / divisions,
          -0.5 + y / divisions,
          -0.5 + z / divisions
        ]);
      }
    }
  }

  for (let z = 0; z < divisions; z++) {
    for (let y = 0; y < divisions; y++) {
      for (let x = 0; x < divisions; x++) {
        const a = index(x, y, z);
        const b = index(x + 1, y, z);
        const c = index(x + 1, y + 1, z);
        const d = index(x, y + 1, z);
        faces.push([a, b, c], [a, c, d]);
        const az = index(x, y, z + 1);
        const bz = index(x + 1, y, z + 1);
        const cz = index(x + 1, y + 1, z + 1);
        const dz = index(x, y + 1, z + 1);
        faces.push([az, cz, bz], [az, dz, cz]);
      }
    }
  }

  return { version: 1, kind: 'mesh3d', vertices, faces };
}

const pathTemplates: PathTemplate[] = [
  {
    id: 'cross-small',
    name: 'Cross (small)',
    kind: 'path',
    defaultWidth: 120,
    defaultHeight: 120,
    geometry: { version: 1, kind: 'path', segments: crossSegments() }
  },
  {
    id: 'gear-medium',
    name: 'Gear (medium)',
    kind: 'path',
    defaultWidth: 180,
    defaultHeight: 180,
    geometry: { version: 1, kind: 'path', segments: gearSegments(24) }
  },
  {
    id: 'grid-stress',
    name: 'Grid (stress)',
    kind: 'path',
    defaultWidth: 240,
    defaultHeight: 240,
    geometry: { version: 1, kind: 'path', segments: stressGridSegments(40) }
  }
];

const meshTemplates: Mesh3DTemplate[] = [
  {
    id: 'cube',
    name: 'Cube',
    kind: 'mesh3d',
    defaultWidth: 160,
    defaultHeight: 160,
    geometry: cubeMesh()
  },
  {
    id: 'low-poly-cube',
    name: 'Low-poly cube',
    kind: 'mesh3d',
    defaultWidth: 180,
    defaultHeight: 180,
    geometry: subdividedCube(2)
  },
  {
    id: 'dense-cube',
    name: 'Dense cube',
    kind: 'mesh3d',
    defaultWidth: 200,
    defaultHeight: 200,
    geometry: subdividedCube(6)
  }
];

export const pathTemplateCatalog: PathTemplate[] = pathTemplates;
export const mesh3DTemplateCatalog: Mesh3DTemplate[] = meshTemplates;
export const allTemplates: ShapeTemplate[] = [...pathTemplates, ...meshTemplates];

export function findTemplate(id: string): ShapeTemplate | undefined {
  return allTemplates.find(template => template.id === id);
}
