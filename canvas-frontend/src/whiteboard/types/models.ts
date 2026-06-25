export type ShapeType = 'Rectangle' | 'Ellipse' | 'Sticky' | 'Text' | 'Line' | 'Image' | 'Path' | 'Mesh3D';

export interface Shape {
  id: string;
  boardId: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  endX: number | null;
  endY: number | null;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text: string | null;
  fontSize: number | null;
  zIndex: number;
  mediaId: string | null;
  imageUrl: string | null;
  altText: string | null;
  templateId: string | null;
  geometryJson: string | null;
  rotationX: number | null;
  rotationY: number | null;
  updatedAt: string;
}

export interface BoardSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface BoardDetail {
  id: string;
  name: string;
  shapes: Shape[];
}

export interface UserIdentity {
  userId: string;
  displayName: string;
  color: string;
}

export interface CmsMedia {
  id: string;
  fileName: string;
  title: string;
  description?: string | null;
  contentType: string;
  size: number;
  uploadedAt: string;
  tags: string[];
}

export type Tool = 'Select' | 'Rectangle' | 'Ellipse' | 'Line' | 'Text' | 'Sticky';

export interface Viewport {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export interface Point {
  x: number;
  y: number;
}
