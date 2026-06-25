import { maybeCaptureLargeBoardScreenshot } from './rumScreenshots';
import { RumSessionConfig } from './rumSessionConfig';
import { extractUserRole } from './rumUserContext';

export interface RumLabelSnapshot {
  plan: string;
  userRole: string;
  feature_area: string;
  releaseRing: string;
  boardId_hash: string;
  widgetCount: string;
  isCollaborativeSession: string;
  integrationContext: string;
  network_effective_type: string;
  memoryUsage_mb: string;
  rum_scenario: string;
  batch_id: string;
  demo_geo: string;
  demo_browser_family: string;
  path_class: string;
}

export interface RumDemoStats {
  dropped: number;
  errorsEmitted: number;
  journeyEventsEmitted: number;
}

declare global {
  interface Window {
    __RUM_DEMO_STATS__?: RumDemoStats;
  }
}

const WIDGET_COUNT_THROTTLE_MS = 2000;
const DEFAULT_INTEGRATION_CONTEXT = 'whiteboard_only';

let sessionConfig: RumSessionConfig | null = null;
let userRole = 'viewer';
let widgetCount = 0;
let pathClass = '';
let boardIdHash = '';
let collaborativeSession = false;
let integrationContext = DEFAULT_INTEGRATION_CONTEXT;
let networkEffectiveType = 'unknown';
let memoryUsageMb = '';
let lastWidgetCountUpdate = 0;

export function initRumLabelContext(config: RumSessionConfig): void {
  sessionConfig = config;
  userRole = extractUserRole(config);
  widgetCount = config.widgetCountSeed ?? 0;
  pathClass = '';
  boardIdHash = '';
  collaborativeSession = config.collabOverride ?? false;
  integrationContext = config.integrationContext?.trim() || DEFAULT_INTEGRATION_CONTEXT;
  networkEffectiveType = 'unknown';
  memoryUsageMb = '';
  lastWidgetCountUpdate = 0;
  ensureDemoStats();
}

export function getRumLabelSnapshot(): RumLabelSnapshot {
  const config = sessionConfig;
  const collabOverride = config?.collabOverride;
  const isCollaborativeSession = collabOverride !== undefined
    ? collabOverride
    : collaborativeSession;

  return {
    plan: config?.plan ?? 'free',
    userRole,
    feature_area: config?.featureArea ?? 'board',
    releaseRing: config?.releaseRing ?? 'stable',
    boardId_hash: boardIdHash,
    widgetCount: String(widgetCount),
    isCollaborativeSession: isCollaborativeSession ? 'true' : 'false',
    integrationContext,
    network_effective_type: networkEffectiveType,
    memoryUsage_mb: memoryUsageMb,
    rum_scenario: config?.scenarioId ?? '',
    batch_id: config?.batchId ?? '',
    demo_geo: config?.demoGeo ?? '',
    demo_browser_family: config?.demoBrowserFamily ?? '',
    path_class: pathClass
  };
}

export function setBoardIdHash(boardId: string): void {
  void hashBoardId(boardId).then(hash => {
    boardIdHash = hash;
  });
}

export function setCollaborativeSession(active: boolean): void {
  if (sessionConfig?.collabOverride !== undefined) {
    return;
  }
  collaborativeSession = active;
}

export function setIntegrationContext(value: string): void {
  integrationContext = value.trim() || DEFAULT_INTEGRATION_CONTEXT;
}

export function refreshNetworkEffectiveType(): void {
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string };
  }).connection;
  networkEffectiveType = connection?.effectiveType?.trim() || 'unknown';
}

export function refreshMemoryUsageMb(): void {
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize?: number };
  }).memory;
  if (typeof memory?.usedJSHeapSize === 'number' && Number.isFinite(memory.usedJSHeapSize)) {
    memoryUsageMb = String(Math.round(memory.usedJSHeapSize / 1048576));
  }
}

export function setWidgetCount(count: number, force = false): void {
  const now = Date.now();
  if (!force && now - lastWidgetCountUpdate < WIDGET_COUNT_THROTTLE_MS) {
    return;
  }
  const prevCount = widgetCount;
  widgetCount = Math.max(0, Math.floor(count));
  lastWidgetCountUpdate = now;
  maybeCaptureLargeBoardScreenshot(prevCount, widgetCount);
}

export function setPathClass(value: string): void {
  pathClass = value;
}

export function incrementDroppedEvents(): void {
  ensureDemoStats().dropped += 1;
}

export function incrementErrorsEmitted(): void {
  ensureDemoStats().errorsEmitted += 1;
}

export function incrementJourneyEventsEmitted(): void {
  ensureDemoStats().journeyEventsEmitted += 1;
}

export function getRumDemoStats(): RumDemoStats {
  return ensureDemoStats();
}

export function resetRumLabelContextForTests(): void {
  sessionConfig = null;
  userRole = 'viewer';
  widgetCount = 0;
  pathClass = '';
  boardIdHash = '';
  collaborativeSession = false;
  integrationContext = DEFAULT_INTEGRATION_CONTEXT;
  networkEffectiveType = 'unknown';
  memoryUsageMb = '';
  lastWidgetCountUpdate = 0;
  delete window.__RUM_DEMO_STATS__;
}

async function hashBoardId(boardId: string): Promise<string> {
  const normalized = boardId.trim();
  if (!normalized) {
    return '';
  }

  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    const encoded = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const hex = Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
    return hex.slice(0, 12);
  }

  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(12, '0').slice(0, 12);
}

function ensureDemoStats(): RumDemoStats {
  if (!window.__RUM_DEMO_STATS__) {
    window.__RUM_DEMO_STATS__ = { dropped: 0, errorsEmitted: 0, journeyEventsEmitted: 0 };
  }
  return window.__RUM_DEMO_STATS__;
}
