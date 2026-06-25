import { RumScenarioDefinition, RumScenarioId } from './types';
import { s01CriticalErrorSpike, s04FreePlanNoise } from './scenarios/s01-s04';
import { s05EnterpriseHighImpact, s09VersionErrorDelta } from './scenarios/s05-s09';
import { s02BoardLoadAbandon, s03GeoBrowserCluster } from './scenarios/s02-s03';
import { s06SlowBackendApi, s07FeSlowSymptom, s08TraceCorrelation } from './scenarios/s06-s08';
import {
  s10VersionInpRegression,
  s11AiJourney,
  s12LongTaskFreeze,
  s13WebSocketHealth,
  s14ResourceChunkFailure
} from './scenarios/s10-s14';

const SCENARIOS: RumScenarioDefinition[] = [
  s01CriticalErrorSpike,
  s02BoardLoadAbandon,
  s03GeoBrowserCluster,
  s04FreePlanNoise,
  s05EnterpriseHighImpact,
  s06SlowBackendApi,
  s07FeSlowSymptom,
  s08TraceCorrelation,
  s09VersionErrorDelta,
  s10VersionInpRegression,
  s11AiJourney,
  s12LongTaskFreeze,
  s13WebSocketHealth,
  s14ResourceChunkFailure
];

const SCENARIO_MAP = new Map<RumScenarioId, RumScenarioDefinition>(
  SCENARIOS.map(scenario => [scenario.id, scenario])
);

export function getScenarioRegistry(): RumScenarioDefinition[] {
  return SCENARIOS;
}

export function resolveScenario(id: RumScenarioId | null | undefined): RumScenarioDefinition | null {
  if (!id) {
    return null;
  }
  return SCENARIO_MAP.get(id) ?? null;
}

export function getScenarioById(id: RumScenarioId): RumScenarioDefinition | undefined {
  return SCENARIO_MAP.get(id);
}

export function groupScenariosByUseCase(): Record<string, RumScenarioDefinition[]> {
  return SCENARIOS.reduce<Record<string, RumScenarioDefinition[]>>((acc, scenario) => {
    const bucket = acc[scenario.useCase] ?? [];
    bucket.push(scenario);
    acc[scenario.useCase] = bucket;
    return acc;
  }, {});
}
