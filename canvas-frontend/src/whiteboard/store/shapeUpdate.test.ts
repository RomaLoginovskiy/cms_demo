import { shapeTransformUpdate } from './shapeUpdate';
import { Shape } from '../types/models';

const baseShape: Shape = {
  id: 'a',
  boardId: 'b',
  type: 'Path',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
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
  templateId: 'cross-small',
  geometryJson: '{"version":1,"kind":"path","segments":[]}',
  rotationX: null,
  rotationY: null,
  updatedAt: '2026-01-01T00:00:00.000Z'
};

describe('shapeTransformUpdate', () => {
  it('clears geometryJson for hub transform updates', () => {
    const payload = shapeTransformUpdate(baseShape, { x: 12 });
    expect(payload.x).toBe(12);
    expect(payload.geometryJson).toBeNull();
  });
});
