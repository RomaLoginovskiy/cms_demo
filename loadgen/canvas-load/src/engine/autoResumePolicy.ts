export interface AutoResumeInput {
  autoResumeEnabled: boolean;
  /** True only when the engine paused itself because the target was unreachable (never for an operator pause). */
  pausedForTargetDown: boolean;
  paused: boolean;
  degraded: boolean;
  frontendReachable: boolean;
  rampInProgress: boolean;
}

/** Pure auto-resume policy used by BrowserLoadEngine probe loop. */
export function shouldAutoResume(input: AutoResumeInput): boolean {
  return (
    input.autoResumeEnabled &&
    input.pausedForTargetDown &&
    input.paused &&
    !input.degraded &&
    input.frontendReachable &&
    !input.rampInProgress
  );
}
