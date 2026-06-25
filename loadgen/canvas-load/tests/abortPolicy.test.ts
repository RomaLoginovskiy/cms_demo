import { evaluateAbortCondition } from '../src/engine/abortPolicy';

describe('evaluateAbortCondition', () => {
  it('returns none before warmup completes', () => {
    const result = evaluateAbortCondition({
      warmupComplete: false,
      errorRate: 0.99,
      errorRateThreshold: 0.05,
      onAbort: 'exit'
    });
    expect(result.decision).toBe('none');
    expect(result.statusMessage).toBeNull();
  });

  it('returns none when error rate is at or below threshold', () => {
    const result = evaluateAbortCondition({
      warmupComplete: true,
      errorRate: 0.05,
      errorRateThreshold: 0.05,
      onAbort: 'exit'
    });
    expect(result.decision).toBe('none');
  });

  it('returns continue without stopping when on_abort is continue', () => {
    const result = evaluateAbortCondition({
      warmupComplete: true,
      errorRate: 0.954,
      errorRateThreshold: 0.05,
      onAbort: 'continue'
    });
    expect(result.decision).toBe('continue');
    expect(result.statusMessage).toContain('continuing load');
    expect(result.statusMessage).toContain('on_abort=continue');
  });

  it('returns exit with status message when on_abort is exit', () => {
    const result = evaluateAbortCondition({
      warmupComplete: true,
      errorRate: 0.954,
      errorRateThreshold: 0.05,
      onAbort: 'exit'
    });
    expect(result.decision).toBe('exit');
    expect(result.statusMessage).toContain('95.4%');
    expect(result.statusMessage).toContain('5.0%');
    expect(result.statusMessage).toContain('on_abort=exit');
  });

  it('returns pause when on_abort is pause', () => {
    const result = evaluateAbortCondition({
      warmupComplete: true,
      errorRate: 0.2,
      errorRateThreshold: 0.05,
      onAbort: 'pause'
    });
    expect(result.decision).toBe('pause');
    expect(result.statusMessage).toContain('on_abort=pause');
  });

  it('returns degrade when on_abort is degrade', () => {
    const result = evaluateAbortCondition({
      warmupComplete: true,
      errorRate: 0.2,
      errorRateThreshold: 0.05,
      onAbort: 'degrade'
    });
    expect(result.decision).toBe('degrade');
    expect(result.statusMessage).toContain('on_abort=degrade');
  });
});
