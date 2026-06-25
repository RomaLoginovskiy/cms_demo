import { RumScenarioDefinition } from '../types';
import { buildScenarioLagOverride, setScenarioLagOverride } from '../../rumScenarioLagOverride';
import { maybeBlockMainThread } from '../../canvasLagSim';
import { runAiJourney } from '../../rumJourney/aiJourneySteps';
import { setScenarioActiveFlag } from '../scenarioFlags';
import { setWidgetCount } from '../../rumLabelContext';

const INP_DELAY_BY_VERSION: Record<string, number> = {
  '1.92903': 0,
  '1.95821': 280
};

export const s10VersionInpRegression: RumScenarioDefinition = {
  id: 's10',
  title: 'Per-version INP regression',
  useCase: 'UC4',
  description: 'Worse interaction latency on v1.95821',
  activate(ctx) {
    const delayMs = INP_DELAY_BY_VERSION[ctx.config.version] ?? 280;
    setScenarioLagOverride(buildScenarioLagOverride('main_thread', delayMs));
    const timerId = ctx.schedule(() => maybeBlockMainThread(delayMs), 4000);
    return () => {
      ctx.clearSchedule(timerId);
      setScenarioLagOverride(null);
    };
  },
  runOnce(ctx) {
    const delayMs = INP_DELAY_BY_VERSION[ctx.config.version] ?? 280;
    maybeBlockMainThread(delayMs);
  }
};

export const s11AiJourney: RumScenarioDefinition = {
  id: 's11',
  title: 'AI flow journey',
  useCase: 'Bonus',
  description: 'Canonical miro.ai.* funnel with TTFT, completion, and empty_completion/failed variants',
  activate(ctx) {
    const variant = ctx.config.errorRate && ctx.config.errorRate > 0.5 ? 'empty_completion' : 'fast_ttft';
    void runAiJourney(variant, (fn, ms) => ctx.schedule(fn, ms));
  },
  runOnce(ctx) {
    void runAiJourney('fast_ttft', (fn, ms) => ctx.schedule(fn, ms));
  }
};

export const s12LongTaskFreeze: RumScenarioDefinition = {
  id: 's12',
  title: 'Long-task / poison-object freeze',
  useCase: 'Bonus',
  description: 'Main-thread block correlated with high widgetCount',
  activate(ctx) {
    setWidgetCount(ctx.config.widgetCountSeed ?? 2500, true);
    setScenarioLagOverride(buildScenarioLagOverride('large_board_render', 0, 800, 100));
    const timerId = ctx.schedule(() => {
      const fakeWidgets = new Array(5000).fill({ id: 'w', data: { nested: true } });
      for (let i = 0; i < fakeWidgets.length; i += 1) {
        JSON.stringify(fakeWidgets[i]);
      }
      maybeBlockMainThread(200);
    }, 2000);
    return () => {
      ctx.clearSchedule(timerId);
      setScenarioLagOverride(null);
    };
  },
  runOnce() {
    setWidgetCount(2500, true);
    maybeBlockMainThread(250);
  }
};

export const s13WebSocketHealth: RumScenarioDefinition = {
  id: 's13',
  title: 'WebSocket health',
  useCase: 'Bonus',
  description: 'Disconnect/reconnect oscillation with miro.ws.* journey events',
  activate() {
    setScenarioActiveFlag('s13_ws_churn', true);
    return () => setScenarioActiveFlag('s13_ws_churn', false);
  }
};

export const s14ResourceChunkFailure: RumScenarioDefinition = {
  id: 's14',
  title: 'Resource / chunk-load failure',
  useCase: 'Bonus',
  description: 'Missing JS chunk or blocked third-party resource',
  activate(ctx) {
    const timerId = ctx.schedule(() => {
      void triggerChunkFailure();
    }, 1500);
    return () => ctx.clearSchedule(timerId);
  },
  runOnce() {
    void triggerChunkFailure();
  }
};

async function triggerChunkFailure(): Promise<void> {
  const script = document.createElement('script');
  script.src = '/api/demo/rum/chunk/missing-chunk-abc123.js';
  script.async = true;
  document.head.appendChild(script);

  try {
    await fetch('/api/demo/rum/chunk/missing-dynamic-chunk-xyz.js');
  } catch {
    // expected resource failure for RUM demo
  }
}
