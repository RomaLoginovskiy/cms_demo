import { measurementService } from '../../services/measurements';
import { rumInfoLog } from '../coralogixRum';
import {
  abandonBoardShapeLoadTiming,
  FIRST_SHAPE_MEASURE,
  LAST_SHAPE_MEASURE,
  onBoardShapePaintFrame,
  resetBoardShapeLoadTimingForTests,
  startBoardShapeLoadTiming
} from './boardShapeLoadTiming';
import {
  createBoardLoadContext,
  resetJourneyContextForTests
} from './journeyContext';

jest.mock('../../services/measurements', () => ({
  measurementService: {
    startTimeMeasurement: jest.fn(),
    endTimeMeasurement: jest.fn(),
    abandonTimeMeasurement: jest.fn()
  }
}));

jest.mock('../coralogixRum', () => ({
  rumInfoLog: jest.fn()
}));

const mockedMeasurement = measurementService as jest.Mocked<typeof measurementService>;

describe('boardShapeLoadTiming', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetJourneyContextForTests();
    resetBoardShapeLoadTimingForTests();
  });

  it('starts both timers once per board load id', () => {
    startBoardShapeLoadTiming('load-1');
    startBoardShapeLoadTiming('load-1');

    expect(mockedMeasurement.startTimeMeasurement).toHaveBeenCalledTimes(2);
    expect(mockedMeasurement.startTimeMeasurement).toHaveBeenCalledWith(
      FIRST_SHAPE_MEASURE,
      { operation: 'open_board' }
    );
    expect(mockedMeasurement.startTimeMeasurement).toHaveBeenCalledWith(
      LAST_SHAPE_MEASURE,
      { operation: 'open_board' }
    );
  });

  it('ends both timers and emits lastWidgetVisible on qualifying paint frame', () => {
    const { boardLoadId, startedAtMs } = createBoardLoadContext();
    jest.spyOn(performance, 'now').mockReturnValue(startedAtMs + 180);

    onBoardShapePaintFrame({ boardLoadId, shapeCount: 5, hasLayout: true });

    expect(mockedMeasurement.endTimeMeasurement).toHaveBeenCalledWith(FIRST_SHAPE_MEASURE);
    expect(mockedMeasurement.endTimeMeasurement).toHaveBeenCalledWith(LAST_SHAPE_MEASURE);
    expect(rumInfoLog).toHaveBeenCalledWith(
      'miro.board.load.lastWidgetVisible',
      expect.objectContaining({
        journey_event: 'miro.board.load.lastWidgetVisible',
        step: 'lastWidgetVisible',
        widget_count: 5,
        elapsed_ms: 180
      }),
      expect.objectContaining({ board_load_id: boardLoadId })
    );
  });

  it('does not end timers when shape count is zero', () => {
    const { boardLoadId } = createBoardLoadContext();

    onBoardShapePaintFrame({ boardLoadId, shapeCount: 0, hasLayout: true });

    expect(mockedMeasurement.endTimeMeasurement).not.toHaveBeenCalled();
    expect(rumInfoLog).not.toHaveBeenCalled();
  });

  it('ignores paint frames for inactive board load id', () => {
    const { boardLoadId } = createBoardLoadContext();

    onBoardShapePaintFrame({ boardLoadId: 'other-load', shapeCount: 3, hasLayout: true });

    expect(mockedMeasurement.endTimeMeasurement).not.toHaveBeenCalled();
  });

  it('ends measurements only once per board load id', () => {
    const { boardLoadId } = createBoardLoadContext();

    onBoardShapePaintFrame({ boardLoadId, shapeCount: 2, hasLayout: true });
    onBoardShapePaintFrame({ boardLoadId, shapeCount: 2, hasLayout: true });

    expect(mockedMeasurement.endTimeMeasurement).toHaveBeenCalledTimes(2);
  });

  it('abandons timers without ending measurements', () => {
    abandonBoardShapeLoadTiming('load-1');

    expect(mockedMeasurement.abandonTimeMeasurement).toHaveBeenCalledWith(FIRST_SHAPE_MEASURE);
    expect(mockedMeasurement.abandonTimeMeasurement).toHaveBeenCalledWith(LAST_SHAPE_MEASURE);
    expect(mockedMeasurement.endTimeMeasurement).not.toHaveBeenCalled();
  });
});
