import { normalizeBox } from './canvasMath';
import { createShapeDraft } from '../store/whiteboardStore';
import { Point, Shape, ShapeType } from '../types/models';

export const MIN_DRAFT_SIZE = 8;

export function createDraftAt(
  boardId: string,
  type: ShapeType,
  world: Point,
  zIndex: number
): Shape {
  return createShapeDraft(boardId, type, {
    x: world.x,
    y: world.y,
    width: MIN_DRAFT_SIZE,
    height: MIN_DRAFT_SIZE,
    endX: type === 'Line' ? world.x : null,
    endY: type === 'Line' ? world.y : null,
    zIndex
  });
}

export function resizeDraft(draft: Shape, start: Point, world: Point): Shape {
  if (draft.type === 'Line') {
    return {
      ...draft,
      width: world.x - start.x,
      height: world.y - start.y,
      endX: world.x,
      endY: world.y
    };
  }

  const box = normalizeBox(start, world);
  return {
    ...draft,
    ...box,
    width: Math.max(MIN_DRAFT_SIZE, box.width),
    height: Math.max(MIN_DRAFT_SIZE, box.height)
  };
}
