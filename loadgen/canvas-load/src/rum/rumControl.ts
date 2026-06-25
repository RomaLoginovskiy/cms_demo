import { LoadConfig } from '../config/types';
import { RumBatchMatrixRow } from './rumSessionPlan';
import { getRumScenarioMeta, isKnownRumBatchPreset, isKnownRumScenario } from './rumDemoCatalog';

export interface ApplyRumScenarioOptions {
  plan?: 'free' | 'enterprise' | 'team';
  version?: string;
  releaseRing?: string;
  featureArea?: string;
  demoGeo?: string;
  demoBrowserFamily?: string;
}

export function buildRumBatchForScenario(
  scenarioId: string,
  options: ApplyRumScenarioOptions = {}
): LoadConfig['rum_batch'] {
  if (!isKnownRumScenario(scenarioId)) {
    throw new Error(`Unknown RUM scenario: ${scenarioId}`);
  }
  const meta = getRumScenarioMeta(scenarioId)!;
  const row: RumBatchMatrixRow = {
    plan: options.plan ?? meta.defaultPlan,
    v: options.version ?? meta.defaultVersion,
    scenario: scenarioId,
    count: 1,
    featureArea: options.featureArea ?? 'board',
    releaseRing: options.releaseRing ?? 'stable',
    demoGeo: options.demoGeo,
    demoBrowserFamily: options.demoBrowserFamily
  };
  return {
    enabled: true,
    append_to_all_navigations: true,
    matrix: [row]
  };
}

export function buildRumBatchForPreset(presetId: string): LoadConfig['rum_batch'] {
  if (!isKnownRumBatchPreset(presetId)) {
    throw new Error(`Unknown RUM batch preset: ${presetId}`);
  }
  return {
    enabled: true,
    preset: presetId,
    append_to_all_navigations: true,
    matrix: []
  };
}

export function buildDisabledRumBatch(): LoadConfig['rum_batch'] {
  return {
    enabled: false,
    append_to_all_navigations: true,
    matrix: []
  };
}
