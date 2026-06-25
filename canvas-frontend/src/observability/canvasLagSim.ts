import { rumInfoLog, rumWarnLog, RuntimeAppConfig } from './coralogixRum';
import { getScenarioLagOverride } from './rumScenarioLagOverride';

export type CanvasLagSimMode =
  | 'hub_outbound'
  | 'hub_inbound'
  | 'main_thread'
  | 'no_optimistic'
  | 'large_board_render';

export interface CanvasLagSimConfig {
  enabled: boolean;
  mode: CanvasLagSimMode;
  delayMs: number;
  jitterMs: number;
  allowProd: boolean;
  renderCostUs: number;
  largeBoardThreshold: number;
}

const VALID_MODES = new Set<CanvasLagSimMode>([
  'hub_outbound',
  'hub_inbound',
  'main_thread',
  'no_optimistic',
  'large_board_render'
]);

let invalidModeWarned = false;
let prodBlockedWarned = false;

export function readCanvasLagSimConfig(config: RuntimeAppConfig = window.__APP_CONFIG__ ?? {}): CanvasLagSimConfig {
  const enabled = parseBool(config.CANVAS_LAG_SIM_ENABLED);
  const mode = parseMode(config.CANVAS_LAG_SIM_MODE);
  const base: CanvasLagSimConfig = {
    enabled,
    mode,
    delayMs: parsePositiveInt(config.CANVAS_LAG_SIM_DELAY_MS, 5500),
    jitterMs: parseNonNegativeInt(config.CANVAS_LAG_SIM_JITTER_MS, 0),
    allowProd: parseBool(config.CANVAS_LAG_SIM_ALLOW_PROD),
    renderCostUs: parseNonNegativeInt(config.CANVAS_LAG_SIM_RENDER_COST_US, 0),
    largeBoardThreshold: parsePositiveInt(config.CANVAS_LAG_SIM_LARGE_BOARD_THRESHOLD, 1000)
  };
  return mergeLagSimOverride(base);
}

function mergeLagSimOverride(base: CanvasLagSimConfig): CanvasLagSimConfig {
  const override = getScenarioLagOverride();
  if (!override) {
    return base;
  }
  return { ...base, ...override, enabled: override.enabled ?? true };
}

export function isLagSimActive(
  config: CanvasLagSimConfig = readCanvasLagSimConfig(),
  environment: string = window.__APP_CONFIG__?.CORALOGIX_ENVIRONMENT ?? 'local'
): boolean {
  if (!config.enabled) {
    return false;
  }

  if (!VALID_MODES.has(config.mode)) {
    warnInvalidMode(config.mode);
    return false;
  }

  const isProd = environment.trim().toLowerCase() === 'production';
  if (isProd && !config.allowProd) {
    warnProdBlocked();
    return false;
  }

  return true;
}

export function getActiveLagSimConfig(): CanvasLagSimConfig | null {
  const config = readCanvasLagSimConfig();
  return isLagSimActive(config) ? config : null;
}

export function usesNoOptimisticUi(config: CanvasLagSimConfig | null = getActiveLagSimConfig()): boolean {
  return config?.mode === 'no_optimistic';
}

export function shouldDelayHubOutbound(config: CanvasLagSimConfig | null = getActiveLagSimConfig()): boolean {
  if (!config) {
    return false;
  }

  return config.mode === 'hub_outbound' || config.mode === 'no_optimistic';
}

export function shouldApplyLargeBoardRenderCost(
  shapeCount: number,
  config: CanvasLagSimConfig | null = getActiveLagSimConfig()
): boolean {
  if (!config) {
    return false;
  }

  return config.mode === 'large_board_render'
    && shapeCount >= config.largeBoardThreshold
    && config.renderCostUs > 0;
}

export async function applyLagDelay(delayMs: number, jitterMs: number): Promise<void> {
  const jitter = jitterMs > 0 ? Math.floor((Math.random() * 2 - 1) * jitterMs) : 0;
  const total = Math.max(0, delayMs + jitter);
  if (total === 0) {
    return;
  }

  await new Promise<void>(resolve => {
    setTimeout(resolve, total);
  });
}

export function applyPerShapeRenderCost(config: CanvasLagSimConfig): void {
  if (config.renderCostUs <= 0) {
    return;
  }

  const end = performance.now() + config.renderCostUs / 1000;
  while (performance.now() < end) {
    // intentional main-thread work for large-board simulation
  }
}

export function maybeBlockMainThread(ms: number): void {
  if (ms <= 0) {
    return;
  }

  const end = performance.now() + ms;
  while (performance.now() < end) {
    // intentional main-thread block
  }
}

export function logLagSimBoot(config: CanvasLagSimConfig): void {
  rumInfoLog('Canvas lag simulation active', {
    lag_sim_mode: config.mode,
    lag_sim_delay_ms: config.delayMs,
    lag_sim_render_cost_us: config.renderCostUs,
    lag_sim_large_board_threshold: config.largeBoardThreshold
  }, {
    mode: config.mode,
    delay_ms: String(config.delayMs)
  });
}

export function logLagSimBlocked(): void {
  rumWarnLog('Canvas lag simulation blocked in production', {}, { reason: 'prod_gate' });
}

function parseMode(value?: string): CanvasLagSimMode {
  const normalized = value?.trim().toLowerCase().replace(/-/g, '_') ?? '';
  if (VALID_MODES.has(normalized as CanvasLagSimMode)) {
    return normalized as CanvasLagSimMode;
  }

  return 'hub_outbound';
}

function parseBool(value?: string): boolean {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function warnInvalidMode(mode: string): void {
  if (invalidModeWarned) {
    return;
  }

  invalidModeWarned = true;
  rumWarnLog('Canvas lag simulation disabled: invalid mode', { mode }, { mode });
}

function warnProdBlocked(): void {
  if (prodBlockedWarned) {
    return;
  }

  prodBlockedWarned = true;
  logLagSimBlocked();
}

export function resetCanvasLagSimForTests(): void {
  invalidModeWarned = false;
  prodBlockedWarned = false;
}

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeAppConfig;
  }
}
