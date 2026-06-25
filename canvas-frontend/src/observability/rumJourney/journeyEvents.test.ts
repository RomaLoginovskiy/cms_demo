import {
  emitAiPromptSubmitted,
  emitAiRunCompleted,
  emitAiRunFailed,
  emitAiRunFirstToken,
  emitBoardLoadFailed,
  emitBoardLoadFirstWidgetVisible,
  emitBoardLoadFullyInteractive,
  emitBoardLoadLastWidgetVisible,
  emitBoardLoadStarted,
  emitMeetJoined,
  emitWsClosed,
  emitWsOpened,
  emitWsReconnected
} from './journeyEvents';
import { rumInfoLog } from '../coralogixRum';
import { resetRumLabelContextForTests } from '../rumLabelContext';

jest.mock('../coralogixRum', () => ({
  rumInfoLog: jest.fn()
}));

describe('journeyEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRumLabelContextForTests();
  });

  it('emits board load started with board_load_id', () => {
    emitBoardLoadStarted('load-1');

    expect(rumInfoLog).toHaveBeenCalledWith(
      'miro.board.load.started',
      expect.objectContaining({ journey_event: 'miro.board.load.started', step: 'started' }),
      expect.objectContaining({ journey: 'miro.board.load.started', board_load_id: 'load-1' })
    );
  });

  it('emits firstWidgetVisible with widget count and elapsed time', () => {
    emitBoardLoadFirstWidgetVisible('load-1', 12, 250);

    expect(rumInfoLog).toHaveBeenCalledWith(
      'miro.board.load.firstWidgetVisible',
      expect.objectContaining({
        journey_event: 'miro.board.load.firstWidgetVisible',
        step: 'firstWidgetVisible',
        widget_count: 12,
        elapsed_ms: 250
      }),
      expect.objectContaining({ board_load_id: 'load-1' })
    );
  });

  it('emits lastWidgetVisible with widget count and elapsed time', () => {
    emitBoardLoadLastWidgetVisible('load-1', 8, 420);

    expect(rumInfoLog).toHaveBeenCalledWith(
      'miro.board.load.lastWidgetVisible',
      expect.objectContaining({
        journey_event: 'miro.board.load.lastWidgetVisible',
        step: 'lastWidgetVisible',
        widget_count: 8,
        elapsed_ms: 420
      }),
      expect.objectContaining({ board_load_id: 'load-1' })
    );
  });

  it('emits fullyInteractive with widget count', () => {
    emitBoardLoadFullyInteractive('load-1', 3);

    expect(rumInfoLog).toHaveBeenCalledWith(
      'miro.board.load.fullyInteractive',
      expect.objectContaining({ step: 'fullyInteractive', widget_count: 3 }),
      expect.objectContaining({ board_load_id: 'load-1' })
    );
  });

  it('emits board load failed with phase and error kind', () => {
    emitBoardLoadFailed('load-1', 'api', new TypeError('bad json'));

    expect(rumInfoLog).toHaveBeenCalledWith(
      'miro.board.load.failed',
      expect.objectContaining({ step: 'failed', phase: 'api', error_kind: 'TypeError' }),
      expect.objectContaining({ board_load_id: 'load-1' })
    );
  });

  it('emits websocket lifecycle events', () => {
    emitWsOpened('/hub');
    emitWsClosed(false, 1006);
    emitWsReconnected();

    expect(rumInfoLog).toHaveBeenCalledWith(
      'miro.ws.opened',
      expect.objectContaining({ step: 'opened', url: '/hub' }),
      expect.objectContaining({ journey: 'miro.ws.opened' })
    );
    expect(rumInfoLog).toHaveBeenCalledWith(
      'miro.ws.closed',
      expect.objectContaining({ step: 'closed', wasClean: false, code: 1006 }),
      expect.objectContaining({ wasClean: 'false' })
    );
    expect(rumInfoLog).toHaveBeenCalledWith(
      'miro.ws.reconnected',
      expect.objectContaining({ step: 'reconnected' }),
      expect.any(Object)
    );
  });

  it('emits meet joined with board id', () => {
    emitMeetJoined('board-abc', 2);

    expect(rumInfoLog).toHaveBeenCalledWith(
      'miro.meet.joined',
      expect.objectContaining({ step: 'joined', presence_count: 2 }),
      expect.objectContaining({ journey: 'miro.meet.joined', board_id: 'board-abc' })
    );
  });

  it('emits canonical AI funnel events', () => {
    emitAiPromptSubmitted({ variant: 'normal' });
    emitAiRunFirstToken(120, { variant: 'normal' });
    emitAiRunCompleted({ variant: 'normal' });
    emitAiRunFailed('empty_completion', { variant: 'empty_completion' });

    expect(rumInfoLog).toHaveBeenCalledWith(
      'miro.ai.prompt.submitted',
      expect.objectContaining({ step: 'submitted', variant: 'normal' }),
      expect.any(Object)
    );
    expect(rumInfoLog).toHaveBeenCalledWith(
      'miro.ai.run.first_token',
      expect.objectContaining({ step: 'first_token', ttft_ms: 120 }),
      expect.any(Object)
    );
    expect(rumInfoLog).toHaveBeenCalledWith(
      'miro.ai.run.completed',
      expect.objectContaining({ step: 'completed' }),
      expect.any(Object)
    );
    expect(rumInfoLog).toHaveBeenCalledWith(
      'miro.ai.run.failed',
      expect.objectContaining({ step: 'failed', reason: 'empty_completion' }),
      expect.any(Object)
    );
  });
});
