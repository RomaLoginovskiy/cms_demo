import { createDraftAt, MIN_DRAFT_SIZE, resizeDraft } from './canvasPointerDraft';

describe('canvasPointerDraft', () => {
  it('creates a draft with minimum visible size', () => {
    const draft = createDraftAt('board-1', 'Rectangle', { x: 100, y: 120 }, 1);

    expect(draft.width).toBe(MIN_DRAFT_SIZE);
    expect(draft.height).toBe(MIN_DRAFT_SIZE);
    expect(draft.x).toBe(100);
    expect(draft.y).toBe(120);
  });

  it('grows draft dimensions on resize without waiting for react render', () => {
    const draft = createDraftAt('board-1', 'Rectangle', { x: 100, y: 120 }, 1);
    const resized = resizeDraft(draft, { x: 100, y: 120 }, { x: 180, y: 200 });

    expect(resized.width).toBe(80);
    expect(resized.height).toBe(80);
    expect(resized.x).toBe(100);
    expect(resized.y).toBe(120);
  });

  it('enforces minimum draft size for tiny drags', () => {
    const draft = createDraftAt('board-1', 'Rectangle', { x: 50, y: 50 }, 1);
    const resized = resizeDraft(draft, { x: 50, y: 50 }, { x: 52, y: 53 });

    expect(resized.width).toBe(MIN_DRAFT_SIZE);
    expect(resized.height).toBe(MIN_DRAFT_SIZE);
  });
});
