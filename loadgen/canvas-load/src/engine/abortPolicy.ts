import { AbortMode } from '../config/types';

export type AbortDecision = 'none' | 'continue' | 'exit' | 'pause' | 'degrade';

export interface AbortEvaluationInput {
  warmupComplete: boolean;
  errorRate: number;
  errorRateThreshold: number;
  onAbort: AbortMode;
}

export interface AbortEvaluationResult {
  decision: AbortDecision;
  statusMessage: string | null;
}

/** Pure abort policy used by BrowserLoadEngine abort monitor. */
export function evaluateAbortCondition(input: AbortEvaluationInput): AbortEvaluationResult {
  const { warmupComplete, errorRate, errorRateThreshold, onAbort } = input;

  if (!warmupComplete || errorRate <= errorRateThreshold) {
    return { decision: 'none', statusMessage: null };
  }

  const errorPct = (errorRate * 100).toFixed(1);
  const thresholdPct = (errorRateThreshold * 100).toFixed(1);
  const base = `Error rate ${errorPct}% exceeds threshold ${thresholdPct}%`;

  switch (onAbort) {
    case 'continue':
      return {
        decision: 'continue',
        statusMessage: `${base} — continuing load (on_abort=continue)`
      };
    case 'exit':
      return {
        decision: 'exit',
        statusMessage: `${base} — exiting (on_abort=exit)`
      };
    case 'pause':
      return {
        decision: 'pause',
        statusMessage: `${base} — paused (on_abort=pause)`
      };
    default:
      return {
        decision: 'degrade',
        statusMessage: `${base} — degraded (on_abort=degrade)`
      };
  }
}
