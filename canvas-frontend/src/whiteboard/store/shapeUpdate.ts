import { Shape } from '../types/models';

/** Hub update that preserves stored geometryJson on the server. */
export function shapeTransformUpdate(shape: Shape, changes: Partial<Shape>): Shape {
  return {
    ...shape,
    ...changes,
    geometryJson: null
  };
}
