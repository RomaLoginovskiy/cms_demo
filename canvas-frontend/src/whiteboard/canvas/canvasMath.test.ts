import { hitTest, screenToWorld, zoomAt } from './canvasMath';
import { Shape } from '../types/models';

function shape(overrides: Partial<Shape> = {}): Shape {
  return {
    id: 'shape-1',
    boardId: 'board-1',
    type: 'Rectangle',
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    endX: null,
    endY: null,
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 2,
    text: null,
    fontSize: null,
    zIndex: 1,
    mediaId: null,
    imageUrl: null,
    altText: null,
    templateId: null,
    geometryJson: null,
    rotationX: null,
    rotationY: null,
    updatedAt: '2026-05-25T00:00:00Z',
    ...overrides
  };
}

test('converts screen coordinates to world coordinates', () => {
  expect(screenToWorld({ x: 120, y: 80 }, { offsetX: 20, offsetY: 30, zoom: 2 })).toEqual({ x: 50, y: 25 });
});

test('clamps zoom between ten and four hundred percent', () => {
  expect(zoomAt({ offsetX: 0, offsetY: 0, zoom: 4 }, { x: 10, y: 10 }, -1).zoom).toBe(4);
  expect(zoomAt({ offsetX: 0, offsetY: 0, zoom: 0.1 }, { x: 10, y: 10 }, 1).zoom).toBe(0.1);
});

test('hit tests boxes and line segments', () => {
  expect(hitTest(shape(), { x: 40, y: 40 })).toBe(true);
  expect(hitTest(shape(), { x: 400, y: 400 })).toBe(false);
  expect(hitTest(shape({ type: 'Line', x: 0, y: 0, endX: 100, endY: 0, width: 100, height: 0 }), { x: 50, y: 3 })).toBe(true);
  expect(hitTest(shape({ type: 'Path', geometryJson: '{}' }), { x: 40, y: 40 })).toBe(true);
});
