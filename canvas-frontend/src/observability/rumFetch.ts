import { getApiBaseUrl } from '../whiteboard/api/apiBase';
import { isScenarioActiveFlag, getRumDemoRequestHeaders } from './rumScenarios/scenarioFlags';
import { injectTraceHeaders } from './rumTracing';

export async function rumFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const demoHeaders = getRumDemoRequestHeaders();
  Object.entries(demoHeaders).forEach(([key, value]) => headers.set(key, value));

  if (isScenarioActiveFlag('s08_trace') || isScenarioActiveFlag('s06_slow_api')) {
    const traced = injectTraceHeaders(headers);
    traced.forEach((value, key) => headers.set(key, value));
  }

  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (isScenarioActiveFlag('s07_fail_next') && url.includes('/api/boards/')) {
    headers.set('X-Rum-Demo', 'fail-next');
  }

  return fetch(input, { ...init, headers });
}

export function getRumDemoApiBase(): string {
  return getApiBaseUrl();
}
