import { Point, Shape, Viewport } from '../types/models';

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.offsetX) / viewport.zoom,
    y: (point.y - viewport.offsetY) / viewport.zoom
  };
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.zoom + viewport.offsetX,
    y: point.y * viewport.zoom + viewport.offsetY
  };
}

export function zoomAt(viewport: Viewport, screenPoint: Point, deltaY: number): Viewport {
  const before = screenToWorld(screenPoint, viewport);
  const factor = deltaY < 0 ? 1.1 : 0.9;
  const zoom = Math.min(4, Math.max(0.1, viewport.zoom * factor));

  return {
    zoom,
    offsetX: screenPoint.x - before.x * zoom,
    offsetY: screenPoint.y - before.y * zoom
  };
}

export function normalizeBox(start: Point, end: Point): Pick<Shape, 'x' | 'y' | 'width' | 'height'> {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

export function hitTest(shape: Shape, point: Point): boolean {
  if (shape.type === 'Line') {
    return distanceToSegment(point, { x: shape.x, y: shape.y }, { x: shape.endX ?? shape.x + shape.width, y: shape.endY ?? shape.y + shape.height }) <= Math.max(6, shape.strokeWidth + 4);
  }

  return point.x >= shape.x && point.x <= shape.x + shape.width && point.y >= shape.y && point.y <= shape.y + shape.height;
}

export function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}
