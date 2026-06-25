import { RumScenarioDefinition } from '../types';
import { setScenarioActiveFlag } from '../scenarioFlags';
import { buildScenarioLagOverride, setScenarioLagOverride } from '../../rumScenarioLagOverride';

export const s06SlowBackendApi: RumScenarioDefinition = {
  id: 's06',
  title: 'Slow backend call',
  useCase: 'UC3',
  description: 'Network request duration above 3500ms baseline via BE middleware',
  activate() {
    setScenarioActiveFlag('s06_slow_api', true);
    setScenarioActiveFlag('s08_trace', true);
    return () => {
      setScenarioActiveFlag('s06_slow_api', false);
      setScenarioActiveFlag('s08_trace', false);
    };
  }
};

export const s07FeSlowSymptom: RumScenarioDefinition = {
  id: 's07',
  title: 'Frontend slow symptom',
  useCase: 'UC3',
  description: 'Board load failure from client hub lag or backend 5xx when errorRate=1',
  activate(ctx) {
    if (ctx.config.errorRate === 1) {
      setScenarioActiveFlag('s07_fail_next', true);
      return () => setScenarioActiveFlag('s07_fail_next', false);
    }
    const delayMs = ctx.config.delayMs ?? 3500;
    setScenarioLagOverride(buildScenarioLagOverride('hub_outbound', delayMs));
    return () => setScenarioLagOverride(null);
  }
};

export const s08TraceCorrelation: RumScenarioDefinition = {
  id: 's08',
  title: 'Trace correlation',
  useCase: 'UC3',
  description: 'traceparent / sentry-trace on instrumented fetches',
  activate() {
    setScenarioActiveFlag('s08_trace', true);
    return () => setScenarioActiveFlag('s08_trace', false);
  }
};
