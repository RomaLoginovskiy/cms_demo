import { LoadConfig, TargetApp } from './types';
import { isInClusterFlag } from './runtime';
import { normalizeBaseUrl } from '../engine/probes';

export const CLUSTER_DEFAULT = 'http://canvas-frontend';

/** In-cluster service URL per app. CMS is built with basename /cms and proxies /api itself. */
export const CLUSTER_DEFAULTS: Record<TargetApp, string> = {
  canvas: CLUSTER_DEFAULT,
  cms: 'http://cms-frontend/cms'
};

export interface ResolveTargetResult {
  url: string;
  source: 'kubernetes' | 'config';
  rewrittenFrom?: string;
}

export function resolveTargetApp(config: LoadConfig): TargetApp {
  return config.target.app === 'cms' ? 'cms' : 'canvas';
}

function isLocalhostHost(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1';
  } catch {
    return url.includes('localhost') || url.includes('127.0.0.1');
  }
}

/**
 * Normalizes target URL. In-cluster, rewrites localhost to the app's service DNS.
 * Configuration comes from UI/YAML only (no env override).
 */
export function coerceTargetUrl(input: string, app: TargetApp = 'canvas'): string {
  const normalized = normalizeBaseUrl(input);
  if (isInClusterFlag() && isLocalhostHost(normalized)) {
    return CLUSTER_DEFAULTS[app];
  }
  return normalized;
}

export function resolveTargetUrl(config: LoadConfig): ResolveTargetResult {
  const configured = normalizeBaseUrl(config.target.frontend_base_url);
  const coerced = coerceTargetUrl(configured, resolveTargetApp(config));
  if (coerced !== configured) {
    return { url: coerced, source: 'kubernetes', rewrittenFrom: configured };
  }
  return { url: coerced, source: 'config' };
}

/** CMS API lives at the origin root for both apps; `/cms/api/media` would return the SPA shell. */
export function cmsApiBaseUrl(frontendBaseUrl: string): string {
  try {
    return new URL(frontendBaseUrl).origin;
  } catch {
    return normalizeBaseUrl(frontendBaseUrl);
  }
}

/** Writes resolved target URL onto config (and cms_probe_url). */
export function applyResolvedTarget(config: LoadConfig): ResolveTargetResult {
  const resolved = resolveTargetUrl(config);
  config.target.frontend_base_url = resolved.url;
  config.target.cms_probe_url = `${cmsApiBaseUrl(resolved.url)}/api/media`;
  return resolved;
}
