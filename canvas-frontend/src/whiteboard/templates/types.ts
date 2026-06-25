import { PathGeometry } from '../geometry/pathGeometry';
import { Mesh3DGeometry } from '../geometry/meshGeometry';

export type TemplateKind = 'path' | 'mesh3d';

interface BaseTemplate {
  id: string;
  name: string;
  defaultWidth: number;
  defaultHeight: number;
}

export interface PathTemplate extends BaseTemplate {
  kind: 'path';
  geometry: PathGeometry;
}

export interface Mesh3DTemplate extends BaseTemplate {
  kind: 'mesh3d';
  geometry: Mesh3DGeometry;
}

export type ShapeTemplate = PathTemplate | Mesh3DTemplate;
