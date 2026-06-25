import { randomId } from '../../util/randomId';

export interface BoardLoadContext {
  boardLoadId: string;
  startedAtMs: number;
}

let activeBoardLoad: BoardLoadContext | null = null;
const emittedFirstWidgetVisible = new Set<string>();
const emittedFirstShapeVisible = new Set<string>();
const emittedLastShapeVisible = new Set<string>();
const startedBoardShapeLoadTiming = new Set<string>();

export function createBoardLoadContext(): BoardLoadContext {
  const context: BoardLoadContext = {
    boardLoadId: randomId(),
    startedAtMs: performance.now()
  };
  activeBoardLoad = context;
  return context;
}

export function getActiveBoardLoadContext(): BoardLoadContext | null {
  return activeBoardLoad;
}

export function clearBoardLoadContext(boardLoadId: string): void {
  if (activeBoardLoad?.boardLoadId === boardLoadId) {
    activeBoardLoad = null;
  }
  emittedFirstWidgetVisible.delete(boardLoadId);
  emittedFirstShapeVisible.delete(boardLoadId);
  emittedLastShapeVisible.delete(boardLoadId);
  startedBoardShapeLoadTiming.delete(boardLoadId);
}

export function markFirstWidgetVisibleEmitted(boardLoadId: string): boolean {
  if (emittedFirstWidgetVisible.has(boardLoadId)) {
    return false;
  }
  emittedFirstWidgetVisible.add(boardLoadId);
  return true;
}

export function markFirstShapeVisibleEmitted(boardLoadId: string): boolean {
  if (emittedFirstShapeVisible.has(boardLoadId)) {
    return false;
  }
  emittedFirstShapeVisible.add(boardLoadId);
  return true;
}

export function markLastShapeVisibleEmitted(boardLoadId: string): boolean {
  if (emittedLastShapeVisible.has(boardLoadId)) {
    return false;
  }
  emittedLastShapeVisible.add(boardLoadId);
  return true;
}

export function markBoardShapeLoadTimingStarted(boardLoadId: string): boolean {
  if (startedBoardShapeLoadTiming.has(boardLoadId)) {
    return false;
  }
  startedBoardShapeLoadTiming.add(boardLoadId);
  return true;
}

export function resetJourneyContextForTests(): void {
  activeBoardLoad = null;
  emittedFirstWidgetVisible.clear();
  emittedFirstShapeVisible.clear();
  emittedLastShapeVisible.clear();
  startedBoardShapeLoadTiming.clear();
}
