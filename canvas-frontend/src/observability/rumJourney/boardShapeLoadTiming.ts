import { measurementService } from '../../services/measurements';
import {
  getActiveBoardLoadContext,
  markBoardShapeLoadTimingStarted,
  markFirstShapeVisibleEmitted,
  markLastShapeVisibleEmitted
} from './journeyContext';
import { emitBoardLoadLastWidgetVisible } from './journeyEvents';

export const FIRST_SHAPE_MEASURE = 'whiteboard_board_load_first_shape_visible';
export const LAST_SHAPE_MEASURE = 'whiteboard_board_load_last_shape_visible';

const BOARD_LOAD_LABELS = { operation: 'open_board' } as const;

export function startBoardShapeLoadTiming(boardLoadId: string): void {
  if (!markBoardShapeLoadTimingStarted(boardLoadId)) {
    return;
  }

  measurementService.startTimeMeasurement(FIRST_SHAPE_MEASURE, { ...BOARD_LOAD_LABELS });
  measurementService.startTimeMeasurement(LAST_SHAPE_MEASURE, { ...BOARD_LOAD_LABELS });
}

export function onBoardShapePaintFrame(params: {
  boardLoadId: string;
  shapeCount: number;
  hasLayout: boolean;
}): void {
  const { boardLoadId, shapeCount, hasLayout } = params;
  const loadContext = getActiveBoardLoadContext();

  if (!loadContext || loadContext.boardLoadId !== boardLoadId || !hasLayout || shapeCount <= 0) {
    return;
  }

  if (markFirstShapeVisibleEmitted(boardLoadId)) {
    measurementService.endTimeMeasurement(FIRST_SHAPE_MEASURE);
  }

  if (markLastShapeVisibleEmitted(boardLoadId)) {
    measurementService.endTimeMeasurement(LAST_SHAPE_MEASURE);
    emitBoardLoadLastWidgetVisible(
      boardLoadId,
      shapeCount,
      performance.now() - loadContext.startedAtMs
    );
  }
}

export function abandonBoardShapeLoadTiming(_boardLoadId: string): void {
  measurementService.abandonTimeMeasurement(FIRST_SHAPE_MEASURE);
  measurementService.abandonTimeMeasurement(LAST_SHAPE_MEASURE);
}

export function resetBoardShapeLoadTimingForTests(): void {
  measurementService.abandonTimeMeasurement(FIRST_SHAPE_MEASURE);
  measurementService.abandonTimeMeasurement(LAST_SHAPE_MEASURE);
}
