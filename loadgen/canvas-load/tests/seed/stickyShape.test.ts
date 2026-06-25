import { buildSticky } from '../../src/seed/stickyShape';

describe('buildSticky', () => {
  it('produces stable Sticky payload shape', () => {
    const shape = buildSticky('board-id', 0, '2026-05-29T12:00:00.000Z');

    expect(shape).toMatchObject({
      boardId: 'board-id',
      type: 'Sticky',
      x: 40,
      y: 40,
      width: 72,
      height: 52,
      text: 'Note 1',
      zIndex: 1,
      geometryJson: null,
      updatedAt: '2026-05-29T12:00:00.000Z'
    });
    expect(shape.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('lays out shapes in a 40-column grid', () => {
    const firstRowEnd = buildSticky('board-id', 39, '2026-05-29T12:00:00.000Z');
    const secondRowStart = buildSticky('board-id', 40, '2026-05-29T12:00:00.000Z');

    expect(firstRowEnd.y).toBe(40);
    expect(secondRowStart.y).toBe(110);
    expect(secondRowStart.x).toBe(40);
  });
});
