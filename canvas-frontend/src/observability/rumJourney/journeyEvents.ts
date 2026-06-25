import { rumInfoLog } from '../coralogixRum';
import { incrementJourneyEventsEmitted } from '../rumLabelContext';
import { createBoardLoadContext } from './journeyContext';

export function emitJourney(
  eventName: string,
  data: Record<string, unknown> = {},
  labels: Record<string, string> = {}
): void {
  incrementJourneyEventsEmitted();
  rumInfoLog(eventName, { journey_event: eventName, ...data }, {
    journey: eventName,
    ...labels
  });
}

function boardLoadLabels(boardLoadId: string): Record<string, string> {
  return { board_load_id: boardLoadId };
}

export function createBoardLoadId(): string {
  return createBoardLoadContext().boardLoadId;
}

export function emitBoardLoadStarted(boardLoadId: string): void {
  emitJourney('miro.board.load.started', { step: 'started' }, boardLoadLabels(boardLoadId));
}

export function emitBoardLoadFirstWidgetVisible(
  boardLoadId: string,
  widgetCount: number,
  elapsedMs: number
): void {
  emitJourney(
    'miro.board.load.firstWidgetVisible',
    { step: 'firstWidgetVisible', widget_count: widgetCount, elapsed_ms: elapsedMs },
    boardLoadLabels(boardLoadId)
  );
}

export function emitBoardLoadLastWidgetVisible(
  boardLoadId: string,
  widgetCount: number,
  elapsedMs: number
): void {
  emitJourney(
    'miro.board.load.lastWidgetVisible',
    { step: 'lastWidgetVisible', widget_count: widgetCount, elapsed_ms: elapsedMs },
    boardLoadLabels(boardLoadId)
  );
}

export function emitBoardLoadFullyInteractive(boardLoadId: string, widgetCount?: number): void {
  emitJourney(
    'miro.board.load.fullyInteractive',
    { step: 'fullyInteractive', ...(widgetCount !== undefined ? { widget_count: widgetCount } : {}) },
    boardLoadLabels(boardLoadId)
  );
}

export function emitBoardLoadFailed(boardLoadId: string, phase: 'api' | 'hub', error: unknown): void {
  const errorKind = error instanceof Error ? error.name : 'Error';
  emitJourney(
    'miro.board.load.failed',
    { step: 'failed', phase, error_kind: errorKind },
    boardLoadLabels(boardLoadId)
  );
}

export function emitWsOpened(url: string): void {
  emitJourney('miro.ws.opened', { url, step: 'opened' });
}

export function emitWsClosed(wasClean: boolean, code?: number): void {
  emitJourney('miro.ws.closed', { wasClean, code, step: 'closed' }, {
    wasClean: String(wasClean)
  });
}

export function emitWsReconnected(): void {
  emitJourney('miro.ws.reconnected', { step: 'reconnected' });
}

export function emitMeetJoined(boardId: string, presenceCount?: number): void {
  emitJourney(
    'miro.meet.joined',
    {
      step: 'joined',
      ...(presenceCount !== undefined ? { presence_count: presenceCount } : {})
    },
    { board_id: boardId }
  );
}

export function emitAiPromptSubmitted(meta: Record<string, unknown> = {}): void {
  emitJourney('miro.ai.prompt.submitted', { step: 'submitted', ...meta });
}

export function emitAiRunFirstToken(ttftMs: number, meta: Record<string, unknown> = {}): void {
  emitJourney('miro.ai.run.first_token', { step: 'first_token', ttft_ms: ttftMs, ...meta });
}

export function emitAiRunCompleted(meta: Record<string, unknown> = {}): void {
  emitJourney('miro.ai.run.completed', { step: 'completed', ...meta });
}

export function emitAiRunFailed(reason: string, meta: Record<string, unknown> = {}): void {
  emitJourney('miro.ai.run.failed', { step: 'failed', reason, ...meta });
}
