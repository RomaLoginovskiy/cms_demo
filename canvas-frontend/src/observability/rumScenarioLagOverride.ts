import { CanvasLagSimConfig, CanvasLagSimMode } from './canvasLagSim';

let scenarioLagOverride: Partial<CanvasLagSimConfig> | null = null;

export function setScenarioLagOverride(override: Partial<CanvasLagSimConfig> | null): void {
  scenarioLagOverride = override;
}

export function getScenarioLagOverride(): Partial<CanvasLagSimConfig> | null {
  return scenarioLagOverride;
}

export function buildScenarioLagOverride(
  mode: CanvasLagSimMode,
  delayMs: number,
  renderCostUs = 0,
  largeBoardThreshold = 1000
): Partial<CanvasLagSimConfig> {
  return {
    enabled: true,
    mode,
    delayMs,
    jitterMs: 0,
    allowProd: true,
    renderCostUs,
    largeBoardThreshold
  };
}

export function resetScenarioLagOverrideForTests(): void {
  scenarioLagOverride = null;
}
