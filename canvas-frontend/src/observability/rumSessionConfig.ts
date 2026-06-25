import { RuntimeAppConfig } from './coralogixRum';
import { parseRumUserParam, RumUserContext } from './rumUserContext';

export type RumPlan = 'free' | 'enterprise' | 'team';
export type RumReleaseRing = 'stable' | 'canary' | 'internal';
export type RumScenarioId =
  | 's01' | 's02' | 's03' | 's04' | 's05' | 's06' | 's07' | 's08'
  | 's09' | 's10' | 's11' | 's12' | 's13' | 's14';

const VALID_PLANS = new Set<RumPlan>(['free', 'enterprise', 'team']);
const VALID_RINGS = new Set<RumReleaseRing>(['stable', 'canary', 'internal']);
const VALID_SCENARIOS = new Set<RumScenarioId>([
  's01', 's02', 's03', 's04', 's05', 's06', 's07', 's08',
  's09', 's10', 's11', 's12', 's13', 's14'
]);

const PANEL_STORAGE_KEY = 'rum_demo_overrides';

export interface RumSessionConfig {
  demoEnabled: boolean;
  allowProd: boolean;
  showPanel: boolean;
  plan: RumPlan;
  version: string;
  scenarioId: RumScenarioId | null;
  featureArea: string;
  releaseRing: RumReleaseRing;
  delayMs?: number | undefined;
  errorRate?: number | undefined;
  demoGeo?: string | undefined;
  demoBrowserFamily?: string | undefined;
  batchId?: string | undefined;
  widgetCountSeed?: number | undefined;
  integrationContext?: string | undefined;
  collabOverride?: boolean | undefined;
  environment: string;
  rumUserContext?: RumUserContext;
}

export type { RumUserContext };

export interface RumPanelOverrides {
  plan?: RumPlan;
  version?: string;
  scenarioId?: RumScenarioId | null;
  featureArea?: string;
  releaseRing?: RumReleaseRing;
  delayMs?: number;
  errorRate?: number;
}

export function parseRumSessionConfig(
  runtime: RuntimeAppConfig = window.__APP_CONFIG__ ?? {},
  search: string = window.location.search
): RumSessionConfig {
  const params = new URLSearchParams(search);
  const panelOverrides = readPanelOverrides();
  const environment = readRuntimeValue(runtime.CORALOGIX_ENVIRONMENT) ?? 'local';

  const demoFromUrl = parseBoolParam(params.get('rumDemo'));
  const demoFromEnv = parseBool(runtime.RUM_DEMO_ENABLED);
  const demoEnabled = demoFromUrl || demoFromEnv || panelOverrides !== null;

  const allowProd = parseBool(runtime.RUM_DEMO_ALLOW_PROD);
  const showPanel = parseBool(runtime.RUM_DEMO_PANEL) || demoFromUrl || environment !== 'production';

  const plan = parsePlan(
    panelOverrides?.plan ?? params.get('plan') ?? undefined
  );
  const version = panelOverrides?.version
    ?? params.get('v')
    ?? params.get('version')
    ?? readRuntimeValue(runtime.CORALOGIX_APP_VERSION)
    ?? 'dev';
  const scenarioId = parseScenarioId(
    panelOverrides?.scenarioId ?? params.get('scenario') ?? params.get('s') ?? undefined
  );
  const featureArea = panelOverrides?.featureArea
    ?? params.get('feature_area')
    ?? params.get('area')
    ?? 'board';
  const releaseRing = parseReleaseRing(
    panelOverrides?.releaseRing ?? params.get('releaseRing') ?? params.get('ring') ?? undefined
  );
  const delayMs = parseOptionalNumber(
    panelOverrides?.delayMs ?? params.get('delayMs') ?? undefined
  );
  const errorRate = parseOptionalNumber(
    panelOverrides?.errorRate ?? params.get('errorRate') ?? undefined
  );
  const widgetCountSeed = parseOptionalNumber(params.get('widgetCount') ?? undefined);
  const integrationContext = params.get('integration_context') ?? undefined;
  const collabOverride = parseOptionalBoolParam(params.get('collab'));
  const rumUserContext = parseRumUserParam(params.get('rum_user'));

  return {
    demoEnabled,
    allowProd,
    showPanel,
    plan,
    version,
    scenarioId,
    featureArea,
    releaseRing,
    delayMs,
    errorRate,
    demoGeo: params.get('geo') ?? undefined,
    demoBrowserFamily: params.get('browser') ?? params.get('demo_browser_family') ?? undefined,
    batchId: params.get('batchId') ?? undefined,
    widgetCountSeed,
    integrationContext: integrationContext?.trim() || undefined,
    collabOverride,
    environment,
    ...(rumUserContext ? { rumUserContext } : {})
  };
}

export function isRumDemoInjectorsAllowed(config: RumSessionConfig): boolean {
  if (!config.demoEnabled) {
    return false;
  }

  if (config.environment.trim().toLowerCase() === 'production' && !config.allowProd) {
    return false;
  }

  return true;
}

export function buildSessionQuery(config: Partial<RumSessionConfig> & { rumDemo?: boolean }): string {
  const params = new URLSearchParams();
  if (config.rumDemo !== false) {
    params.set('rumDemo', '1');
  }
  if (config.plan) {
    params.set('plan', config.plan);
  }
  if (config.version) {
    params.set('v', config.version);
  }
  if (config.scenarioId) {
    params.set('scenario', config.scenarioId);
  }
  if (config.featureArea) {
    params.set('feature_area', config.featureArea);
  }
  if (config.releaseRing) {
    params.set('ring', config.releaseRing);
  }
  if (config.delayMs !== undefined) {
    params.set('delayMs', String(config.delayMs));
  }
  if (config.errorRate !== undefined) {
    params.set('errorRate', String(config.errorRate));
  }
  if (config.demoGeo) {
    params.set('geo', config.demoGeo);
  }
  if (config.demoBrowserFamily) {
    params.set('browser', config.demoBrowserFamily);
  }
  if (config.batchId) {
    params.set('batchId', config.batchId);
  }
  if (config.widgetCountSeed !== undefined) {
    params.set('widgetCount', String(config.widgetCountSeed));
  }
  if (config.integrationContext) {
    params.set('integration_context', config.integrationContext);
  }
  if (config.collabOverride !== undefined) {
    params.set('collab', config.collabOverride ? '1' : '0');
  }
  return params.toString();
}

export function savePanelOverrides(overrides: RumPanelOverrides): void {
  sessionStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(overrides));
}

export function clearPanelOverrides(): void {
  sessionStorage.removeItem(PANEL_STORAGE_KEY);
}

export function readPanelOverrides(): RumPanelOverrides | null {
  try {
    const raw = sessionStorage.getItem(PANEL_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as RumPanelOverrides;
  } catch {
    return null;
  }
}

function parsePlan(value?: string | null): RumPlan {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (VALID_PLANS.has(normalized as RumPlan)) {
    return normalized as RumPlan;
  }
  return 'free';
}

function parseReleaseRing(value?: string | null): RumReleaseRing {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (VALID_RINGS.has(normalized as RumReleaseRing)) {
    return normalized as RumReleaseRing;
  }
  return 'stable';
}

function parseScenarioId(value?: string | null): RumScenarioId | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!normalized) {
    return null;
  }
  if (VALID_SCENARIOS.has(normalized as RumScenarioId)) {
    return normalized as RumScenarioId;
  }
  return null;
}

function parseBoolParam(value: string | null): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function parseBool(value?: string): boolean {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function parseOptionalBoolParam(value: string | null): boolean | undefined {
  if (value === '1' || value?.toLowerCase() === 'true') {
    return true;
  }
  if (value === '0' || value?.toLowerCase() === 'false') {
    return false;
  }
  return undefined;
}

function parseOptionalNumber(value?: string | null | number): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readRuntimeValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{[^}]+}$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function isValidScenarioId(id: string): id is RumScenarioId {
  return VALID_SCENARIOS.has(id as RumScenarioId);
}
