import { randomUUID } from 'crypto';

export interface SeedShape {
  id: string;
  boardId: string;
  type: 'Sticky';
  x: number;
  y: number;
  width: number;
  height: number;
  endX: null;
  endY: null;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text: string;
  fontSize: number;
  zIndex: number;
  mediaId: null;
  imageUrl: null;
  altText: null;
  templateId: null;
  geometryJson: null;
  rotationX: null;
  rotationY: null;
  updatedAt: string;
}

export function buildSticky(boardId: string, index: number, now = new Date().toISOString()): SeedShape {
  const cols = 40;
  const cellW = 90;
  const cellH = 70;
  const col = index % cols;
  const row = Math.floor(index / cols);

  return {
    id: randomUUID(),
    boardId,
    type: 'Sticky',
    x: 40 + col * cellW,
    y: 40 + row * cellH,
    width: 72,
    height: 52,
    endX: null,
    endY: null,
    fill: '#fef3c7',
    stroke: '#1f2937',
    strokeWidth: 2,
    text: `Note ${index + 1}`,
    fontSize: 14,
    zIndex: index + 1,
    mediaId: null,
    imageUrl: null,
    altText: null,
    templateId: null,
    geometryJson: null,
    rotationX: null,
    rotationY: null,
    updatedAt: now
  };
}
