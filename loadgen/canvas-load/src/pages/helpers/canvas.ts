import { Page } from 'playwright';
import { createRng, randomInt } from '../../util/random';

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export async function canvasSize(page: Page): Promise<{ width: number; height: number }> {
  const box = await page.getByTestId('whiteboard-canvas').boundingBox();
  if (!box || box.width < 20 || box.height < 20) {
    throw new Error('whiteboard canvas not laid out');
  }
  return { width: box.width, height: box.height };
}

/** Random box in pixel coords relative to the canvas element (not the viewport). */
export function randomBoxInArea(width: number, height: number, rng: () => number): Box {
  const margin = 40;
  const maxX = Math.max(margin + 60, width - margin);
  const maxY = Math.max(margin + 60, height - margin);
  const x1 = randomInt(margin, maxX - 50, rng);
  const y1 = randomInt(margin, maxY - 50, rng);
  const x2 = randomInt(Math.min(x1 + 40, maxX), maxX, rng);
  const y2 = randomInt(Math.min(y1 + 40, maxY), maxY, rng);
  return { x1, y1, x2, y2 };
}

export async function randomCanvasBox(page: Page, rng: () => number): Promise<Box> {
  const { width, height } = await canvasSize(page);
  return randomBoxInArea(width, height, rng);
}

/** @deprecated Use randomCanvasBox — viewport coords overlap side panels. */
export function randomBox(
  viewportWidth: number,
  viewportHeight: number,
  rng: () => number
): Box {
  return randomBoxInArea(viewportWidth, viewportHeight, rng);
}

function clampPoint(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const margin = 20;
  return {
    x: Math.max(margin, Math.min(x, width - margin)),
    y: Math.max(margin, Math.min(y, height - margin))
  };
}

function clampBox(box: Box, width: number, height: number): Box {
  const a = clampPoint(box.x1, box.y1, width, height);
  const b = clampPoint(box.x2, box.y2, width, height);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

export async function drawOnCanvas(
  page: Page,
  tool: string,
  box: Box
): Promise<void> {
  const { width, height } = await canvasSize(page);
  const b = clampBox(box, width, height);
  await page.getByRole('button', { name: tool, exact: true }).click();
  const canvas = page.getByTestId('whiteboard-canvas');
  await canvas.dragTo(canvas, {
    sourcePosition: { x: b.x1, y: b.y1 },
    targetPosition: { x: b.x2, y: b.y2 }
  });
}

export async function moveMouseOnCanvas(page: Page, x: number, y: number): Promise<void> {
  const { width, height } = await canvasSize(page);
  const p = clampPoint(x, y, width, height);
  const canvas = page.getByTestId('whiteboard-canvas');
  await canvas.hover({ position: p });
}

export function createViewportRng(seed: number, userIndex: number): () => number {
  return createRng(seed + userIndex * 997);
}
