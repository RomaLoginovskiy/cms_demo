import { runAiJourney } from './aiJourneySteps';
import { rumInfoLog } from '../coralogixRum';
import { resetRumLabelContextForTests } from '../rumLabelContext';

jest.mock('../coralogixRum', () => ({
  rumInfoLog: jest.fn()
}));

function immediateSchedule(fn: () => void): number {
  fn();
  return 1;
}

function collectMessages(): string[] {
  return (rumInfoLog as jest.Mock).mock.calls.map(call => call[0] as string);
}

describe('runAiJourney', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRumLabelContextForTests();
  });

  it('emits canonical fast_ttft funnel in order', async () => {
    await runAiJourney('fast_ttft', immediateSchedule);

    const messages = collectMessages();
    expect(messages[0]).toBe('miro.ai.prompt.submitted');
    expect(messages).toContain('miro.ai.run.first_token');
    expect(messages[messages.length - 1]).toBe('miro.ai.run.completed');
    expect(messages).not.toContain('miro.ai.run.failed');
  });

  it('maps empty_completion to run.failed', async () => {
    await runAiJourney('empty_completion', immediateSchedule);

    const messages = collectMessages();
    expect(messages[0]).toBe('miro.ai.prompt.submitted');
    expect(messages).toContain('miro.ai.run.failed');
    expect(messages).not.toContain('miro.ai.run.completed');
    expect(messages).not.toContain('miro.ai.run.first_token');
  });

  it('maps failed variant to run.failed before completion', async () => {
    await runAiJourney('failed', immediateSchedule);

    const messages = collectMessages();
    expect(messages).toContain('miro.ai.run.failed');
    expect(messages).not.toContain('miro.ai.run.completed');
    expect(messages).not.toContain('miro.ai.run.first_token');
  });

  it('includes ttft_ms on first_token event', async () => {
    await runAiJourney('normal', immediateSchedule);

    const firstTokenCall = (rumInfoLog as jest.Mock).mock.calls.find(
      call => call[0] === 'miro.ai.run.first_token'
    );
    expect(firstTokenCall?.[1]).toEqual(expect.objectContaining({ ttft_ms: 400 }));
  });
});
