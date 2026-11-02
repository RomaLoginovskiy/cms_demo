import { AutoResumeInput, shouldAutoResume } from '../src/engine/autoResumePolicy';

const base: AutoResumeInput = {
  autoResumeEnabled: true,
  pausedForTargetDown: true,
  paused: true,
  degraded: false,
  frontendReachable: true,
  rampInProgress: false
};

describe('shouldAutoResume', () => {
  it('resumes when the target is back after a target-down pause', () => {
    expect(shouldAutoResume(base)).toBe(true);
  });

  it('does not resume when auto_resume is disabled', () => {
    expect(shouldAutoResume({ ...base, autoResumeEnabled: false })).toBe(false);
  });

  it('does not override an operator pause', () => {
    expect(shouldAutoResume({ ...base, pausedForTargetDown: false })).toBe(false);
  });

  it('does not resume while the target is still unreachable', () => {
    expect(shouldAutoResume({ ...base, frontendReachable: false })).toBe(false);
  });

  it('does not resume while a ramp is in progress or the engine is degraded', () => {
    expect(shouldAutoResume({ ...base, rampInProgress: true })).toBe(false);
    expect(shouldAutoResume({ ...base, degraded: true })).toBe(false);
  });

  it('does nothing when the engine is not paused', () => {
    expect(shouldAutoResume({ ...base, paused: false })).toBe(false);
  });
});
