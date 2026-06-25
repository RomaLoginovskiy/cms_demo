declare global {
  interface Window {
    __RUM_SCENARIO_FLAGS__?: Record<string, boolean>;
  }
}

export function setScenarioActiveFlag(flag: string, active: boolean): void {
  if (!window.__RUM_SCENARIO_FLAGS__) {
    window.__RUM_SCENARIO_FLAGS__ = {};
  }
  if (active) {
    window.__RUM_SCENARIO_FLAGS__[flag] = true;
  } else {
    delete window.__RUM_SCENARIO_FLAGS__[flag];
  }
}

export function isScenarioActiveFlag(flag: string): boolean {
  return window.__RUM_SCENARIO_FLAGS__?.[flag] === true;
}

export function resetScenarioFlagsForTests(): void {
  delete window.__RUM_SCENARIO_FLAGS__;
}

export function getRumDemoRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (isScenarioActiveFlag('s06_slow_api')) {
    headers['X-Rum-Demo'] = 'slow-api';
  }
  if (isScenarioActiveFlag('s07_fail_next')) {
    headers['X-Rum-Demo'] = 'fail-next';
  }
  if (isScenarioActiveFlag('s08_trace')) {
    // trace headers injected separately via rumTracing
  }
  return headers;
}
