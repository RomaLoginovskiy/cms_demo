import { LoadConfig } from './types';
import { isInClusterFlag } from './runtime';
import { normalizeBaseUrl } from '../engine/probes';

export const CLUSTER_DEFAULT = 'http://canvas-frontend';

export interface ResolveTargetResult {
  url: string;
  source: 'kubernetes' | 'config';
  rewrittenFrom?: string;
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
 * Normalizes target URL. In-cluster, rewrites localhost to canvas service DNS.
 * Configuration comes from UI/YAML only (no env override).
 */
export function coerceTargetUrl(input: string): string {
  const normalized = normalizeBaseUrl(input);
  if (isInClusterFlag() && isLocalhostHost(normalized)) {
    return CLUSTER_DEFAULT;
  }
  return normalized;
}

export function resolveTargetUrl(config: LoadConfig): ResolveTargetResult {
  const configured = normalizeBaseUrl(config.target.frontend_base_url);
  const coerced = coerceTargetUrl(configured);
  if (coerced !== configured) {
    return { url: coerced, source: 'kubernetes', rewrittenFrom: configured };
  }
  return { url: coerced, source: 'config' };
}

/** Writes resolved target URL onto config (and cms_probe_url). */
export function applyResolvedTarget(config: LoadConfig): ResolveTargetResult {
  const resolved = resolveTargetUrl(config);
  config.target.frontend_base_url = resolved.url;
  config.target.cms_probe_url = `${resolved.url}/api/media`;
  return resolved;
}
