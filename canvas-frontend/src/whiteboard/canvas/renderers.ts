import {
  applyPerShapeRenderCost,
  getActiveLagSimConfig,
  shouldApplyLargeBoardRenderCost
} from '../../observability/canvasLagSim';
import { buildPath2D, parsePathGeometry, pathGeometryCacheKey } from '../geometry/pathGeometry';
import { Shape, UserIdentity, Viewport } from '../types/models';

const imageCache = new Map<string, HTMLImageElement>();
const pathCache = new Map<string, Path2D>();

export function renderScene(
  canvas: HTMLCanvasElement,
  shapes: Shape[],
  selectedShapeIds: string[],
  viewport: Viewport,
  remoteSelections: Record<string, { user: UserIdentity; shapeIds: string[] }>,
  cursors: Record<string, { user: UserIdentity; x: number; y: number }>,
  layoutWidth: number,
  layoutHeight: number,
  onImageLoad?: () => void
): void {
  const context = canvas.getContext('2d');
  if (!context || layoutWidth <= 0 || layoutHeight <= 0) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(layoutWidth * ratio));
  canvas.height = Math.max(1, Math.floor(layoutHeight * ratio));

  context.save();
  context.scale(ratio, ratio);
  context.clearRect(0, 0, layoutWidth, layoutHeight);
  context.translate(viewport.offsetX, viewport.offsetY);
  context.scale(viewport.zoom, viewport.zoom);

  const lagConfig = getActiveLagSimConfig();
  const applyRenderCost = lagConfig && shouldApplyLargeBoardRenderCost(shapes.length, lagConfig);

  for (const shape of [...shapes].sort((a, b) => a.zIndex - b.zIndex)) {
    drawShape(context, shape, onImageLoad);
    if (applyRenderCost) {
      applyPerShapeRenderCost(lagConfig);
    }
  }

  for (const shape of shapes.filter(item => selectedShapeIds.includes(item.id))) {
    drawOutline(context, shape, '#111827', []);
  }

  for (const selection of Object.values(remoteSelections)) {
    for (const shape of shapes.filter(item => selection.shapeIds.includes(item.id))) {
      drawOutline(context, shape, selection.user.color, [6, 4]);
    }
  }

  context.restore();
  drawCursors(context, cursors, ratio);
}

function drawShape(context: CanvasRenderingContext2D, shape: Shape, onImageLoad?: () => void): void {
  context.save();
  context.lineWidth = shape.strokeWidth;
  context.strokeStyle = shape.stroke;
  context.fillStyle = shape.fill;

  if (shape.type === 'Rectangle' || shape.type === 'Sticky' || shape.type === 'Text') {
    context.fillRect(shape.x, shape.y, shape.width, shape.height);
    context.strokeRect(shape.x, shape.y, shape.width, shape.height);
    drawText(context, shape);
  } else if (shape.type === 'Ellipse') {
    context.beginPath();
    context.ellipse(shape.x + shape.width / 2, shape.y + shape.height / 2, Math.abs(shape.width / 2), Math.abs(shape.height / 2), 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  } else if (shape.type === 'Line') {
    context.beginPath();
    context.moveTo(shape.x, shape.y);
    context.lineTo(shape.endX ?? shape.x + shape.width, shape.endY ?? shape.y + shape.height);
    context.stroke();
  } else if (shape.type === 'Image') {
    drawImageShape(context, shape, onImageLoad);
  } else if (shape.type === 'Path') {
    drawPathShape(context, shape);
  }

  context.restore();
}

function drawPathShape(context: CanvasRenderingContext2D, shape: Shape): void {
  const geometry = parsePathGeometry(shape.geometryJson);
  if (!geometry) {
    context.strokeRect(shape.x, shape.y, shape.width, shape.height);
    return;
  }

  const cacheKey = pathGeometryCacheKey(shape.geometryJson ?? '', shape.x, shape.y, shape.width, shape.height);
  let path = pathCache.get(cacheKey);
  if (!path) {
    path = buildPath2D(geometry, shape.x, shape.y, shape.width, shape.height);
    pathCache.set(cacheKey, path);
  }

  context.stroke(path);
}

function drawText(context: CanvasRenderingContext2D, shape: Shape): void {
  if (!shape.text) {
    return;
  }

  context.fillStyle = '#111827';
  context.font = `${shape.fontSize ?? 18}px sans-serif`;
  context.fillText(shape.text, shape.x + 12, shape.y + 28, Math.max(20, shape.width - 24));
}

function drawImageShape(context: CanvasRenderingContext2D, shape: Shape, onImageLoad?: () => void): void {
  if (!shape.imageUrl) {
    context.strokeRect(shape.x, shape.y, shape.width, shape.height);
    return;
  }

  let image = imageCache.get(shape.imageUrl);
  if (!image) {
    image = new Image();
    image.onload = () => onImageLoad?.();
    image.src = shape.imageUrl;
    imageCache.set(shape.imageUrl, image);
  }

  if (image.complete) {
    context.drawImage(image, shape.x, shape.y, shape.width, shape.height);
  } else {
    context.fillStyle = '#f3f4f6';
    context.fillRect(shape.x, shape.y, shape.width, shape.height);
  }

  context.strokeRect(shape.x, shape.y, shape.width, shape.height);
}

function drawOutline(context: CanvasRenderingContext2D, shape: Shape, color: string, dash: number[]): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.setLineDash(dash);
  const minX = Math.min(shape.x, shape.endX ?? shape.x + shape.width);
  const minY = Math.min(shape.y, shape.endY ?? shape.y + shape.height);
  const maxX = Math.max(shape.x + shape.width, shape.endX ?? shape.x + shape.width);
  const maxY = Math.max(shape.y + shape.height, shape.endY ?? shape.y + shape.height);
  context.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);
  context.restore();
}

function drawCursors(
  context: CanvasRenderingContext2D,
  cursors: Record<string, { user: UserIdentity; x: number; y: number }>,
  ratio: number
): void {
  context.save();
  context.scale(ratio, ratio);
  for (const cursor of Object.values(cursors)) {
    context.fillStyle = cursor.user.color;
    context.beginPath();
    context.moveTo(cursor.x, cursor.y);
    context.lineTo(cursor.x + 12, cursor.y + 4);
    context.lineTo(cursor.x + 4, cursor.y + 12);
    context.fill();
    context.fillText(cursor.user.displayName, cursor.x + 14, cursor.y + 16);
  }
  context.restore();
}
