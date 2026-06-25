import {
  emitAiPromptSubmitted,
  emitAiRunCompleted,
  emitAiRunFailed,
  emitAiRunFirstToken,
  emitJourney
} from './journeyEvents';

export type AiJourneyVariant = 'fast_ttft' | 'empty_completion' | 'normal' | 'failed';

const EXTENDED_AI_STEPS = [
  'miro.ai.context.loaded',
  'miro.ai.stream.opened',
  'miro.ai.text.delta',
  'miro.ai.text.completed'
] as const;

export async function runAiJourney(
  variant: AiJourneyVariant = 'normal',
  schedule: (fn: () => void, ms: number) => number = (fn, ms) => window.setTimeout(fn, ms)
): Promise<void> {
  emitAiPromptSubmitted({ variant });
  await delay(50, schedule);
  emitJourney(EXTENDED_AI_STEPS[0], { step: '2', variant });
  await delay(50, schedule);
  emitJourney(EXTENDED_AI_STEPS[1], { step: '3', variant });

  if (variant === 'empty_completion') {
    await delay(100, schedule);
    emitAiRunFailed('empty_completion', { variant });
    return;
  }

  if (variant === 'failed') {
    await delay(100, schedule);
    emitAiRunFailed('stream_error', { variant });
    return;
  }

  const ttftMs = variant === 'fast_ttft' ? 80 : 400;
  await delay(ttftMs, schedule);
  emitAiRunFirstToken(ttftMs, { variant });
  await delay(50, schedule);
  emitJourney(EXTENDED_AI_STEPS[2], { step: '5', variant });

  if (variant === 'fast_ttft') {
    await delay(3000, schedule);
  } else {
    await delay(200, schedule);
  }

  emitJourney(EXTENDED_AI_STEPS[3], { step: '6', variant });
  await delay(50, schedule);
  emitAiRunCompleted({ variant });
}

function delay(ms: number, schedule: (fn: () => void, ms: number) => number): Promise<void> {
  return new Promise(resolve => {
    schedule(() => resolve(), ms);
  });
}
