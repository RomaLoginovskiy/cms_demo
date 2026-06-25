export interface RumDemoScenarioMeta {
  id: string;
  title: string;
  useCase: string;
  description: string;
  defaultPlan: 'free' | 'enterprise' | 'team';
  defaultVersion: string;
}

export interface RumDemoBatchPresetMeta {
  id: string;
  title: string;
  description: string;
  suggestedUsers: number;
}

export const RUM_DEMO_SCENARIOS: RumDemoScenarioMeta[] = [
  { id: 's01', title: 'Critical error spike', useCase: 'UC1', description: 'Stable fingerprint on board critical path', defaultPlan: 'free', defaultVersion: '1.95821' },
  { id: 's02', title: 'Board-load failure', useCase: 'UC1', description: 'started without fullyInteractive', defaultPlan: 'free', defaultVersion: '1.95821' },
  { id: 's03', title: 'Geo/browser cluster', useCase: 'UC1', description: 'Shared error with demo_geo / browser labels', defaultPlan: 'free', defaultVersion: '1.95821' },
  { id: 's04', title: 'Background noise', useCase: 'UC2', description: 'High-volume low-impact, plan=free', defaultPlan: 'free', defaultVersion: '1.95821' },
  { id: 's05', title: 'Enterprise high-impact', useCase: 'UC2', description: 'Rare critical errors, plan=enterprise', defaultPlan: 'enterprise', defaultVersion: '1.95821' },
  { id: 's06', title: 'Slow backend API', useCase: 'UC3', description: 'Network p95 ≥ 3500ms (needs RUM_DEMO_ENABLED on backend)', defaultPlan: 'enterprise', defaultVersion: '1.95821' },
  { id: 's07', title: 'FE slow symptom', useCase: 'UC3', description: 'Hub lag or fail-next 500 (errorRate=1 for 5xx)', defaultPlan: 'enterprise', defaultVersion: '1.95821' },
  { id: 's08', title: 'Trace correlation', useCase: 'UC3', description: 'traceparent on API calls', defaultPlan: 'enterprise', defaultVersion: '1.95821' },
  { id: 's09', title: 'Version error delta', useCase: 'UC4', description: 'Compare v1.92903 vs v1.95821', defaultPlan: 'free', defaultVersion: '1.95821' },
  { id: 's10', title: 'INP regression', useCase: 'UC4', description: 'Worse interaction latency on v1.95821', defaultPlan: 'free', defaultVersion: '1.95821' },
  { id: 's11', title: 'AI journey', useCase: 'Bonus', description: '7-step miro.ai.* flow', defaultPlan: 'enterprise', defaultVersion: '1.95821' },
  { id: 's12', title: 'Long-task freeze', useCase: 'Bonus', description: 'Main-thread block + widgetCount', defaultPlan: 'enterprise', defaultVersion: '1.95821' },
  { id: 's13', title: 'WebSocket health', useCase: 'Bonus', description: 'Disconnect/reconnect oscillation', defaultPlan: 'free', defaultVersion: '1.95821' },
  { id: 's14', title: 'Chunk load failure', useCase: 'Bonus', description: 'Missing JS chunk / resource 404', defaultPlan: 'free', defaultVersion: '1.95821' }
];

export const RUM_DEMO_BATCH_PRESETS: RumDemoBatchPresetMeta[] = [
  { id: 'uc1_critical_spike', title: 'UC1 critical spike', description: '50× s01 with mixed geo/browser', suggestedUsers: 50 },
  { id: 'uc2_plan_mix', title: 'UC2 plan mix', description: '40× s04 free + 10× s05 enterprise', suggestedUsers: 50 },
  { id: 'uc4_version_ab', title: 'UC4 version A/B', description: '25× v1.92903 s09 + 25× v1.95821 s09', suggestedUsers: 50 }
];

const SCENARIO_IDS = new Set(RUM_DEMO_SCENARIOS.map(s => s.id));
const PRESET_IDS = new Set(RUM_DEMO_BATCH_PRESETS.map(p => p.id));

export function isKnownRumScenario(id: string): boolean {
  return SCENARIO_IDS.has(id);
}

export function isKnownRumBatchPreset(id: string): boolean {
  return PRESET_IDS.has(id);
}

export function getRumScenarioMeta(id: string): RumDemoScenarioMeta | undefined {
  return RUM_DEMO_SCENARIOS.find(s => s.id === id);
}
