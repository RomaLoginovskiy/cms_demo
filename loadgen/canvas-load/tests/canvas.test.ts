import { randomBoxInArea } from '../src/pages/helpers/canvas';
import { createRng } from '../src/util/random';

describe('randomBoxInArea', () => {
  it('keeps coordinates inside canvas dimensions', () => {
    const rng = createRng(1);
    const { x1, y1, x2, y2 } = randomBoxInArea(900, 664, rng);
    expect(x1).toBeGreaterThanOrEqual(40);
    expect(y1).toBeGreaterThanOrEqual(40);
    expect(x2).toBeLessThanOrEqual(860);
    expect(y2).toBeLessThanOrEqual(624);
  });
});
