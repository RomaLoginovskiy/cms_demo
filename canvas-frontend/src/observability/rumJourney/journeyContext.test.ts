import {
  createBoardLoadContext,
  markBoardShapeLoadTimingStarted,
  markFirstShapeVisibleEmitted,
  markFirstWidgetVisibleEmitted,
  markLastShapeVisibleEmitted,
  resetJourneyContextForTests
} from './journeyContext';

describe('journeyContext', () => {
  beforeEach(() => {
    resetJourneyContextForTests();
  });

  it('emits firstWidgetVisible only once per board load id', () => {
    const { boardLoadId } = createBoardLoadContext();

    expect(markFirstWidgetVisibleEmitted(boardLoadId)).toBe(true);
    expect(markFirstWidgetVisibleEmitted(boardLoadId)).toBe(false);
  });

  it('dedupes shape visibility milestones per board load id', () => {
    const { boardLoadId } = createBoardLoadContext();

    expect(markFirstShapeVisibleEmitted(boardLoadId)).toBe(true);
    expect(markFirstShapeVisibleEmitted(boardLoadId)).toBe(false);
    expect(markLastShapeVisibleEmitted(boardLoadId)).toBe(true);
    expect(markLastShapeVisibleEmitted(boardLoadId)).toBe(false);
  });

  it('starts board shape load timing only once per board load id', () => {
    expect(markBoardShapeLoadTimingStarted('load-1')).toBe(true);
    expect(markBoardShapeLoadTimingStarted('load-1')).toBe(false);
  });

  it('resets dedupe state for tests', () => {
    const { boardLoadId } = createBoardLoadContext();
    markFirstWidgetVisibleEmitted(boardLoadId);

    resetJourneyContextForTests();

    expect(markFirstWidgetVisibleEmitted(boardLoadId)).toBe(true);
  });
});
