import { cmsApiBaseUrl } from '../config/resolveTargetUrl';
import { LoadConfig } from '../config/types';

export interface CmsMediaSummary {
  id: string;
  tags?: string[];
}

export async function listMediaByTag(apiBase: string, tag: string): Promise<CmsMediaSummary[]> {
  const res = await fetch(`${apiBase}/api/media/filter?tags=${encodeURIComponent(tag)}`, {
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) {
    throw new Error(`list media by tag failed: ${res.status}`);
  }
  return (await res.json()) as CmsMediaSummary[];
}

export async function deleteMedia(apiBase: string, id: string): Promise<boolean> {
  const res = await fetch(`${apiBase}/api/media/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(10_000)
  });
  return res.ok || res.status === 404;
}

/** Deletes every media item carrying the loadgen marker tag. Best effort. */
export async function cleanupCmsMedia(config: LoadConfig): Promise<number> {
  const apiBase = cmsApiBaseUrl(config.target.frontend_base_url);
  let deleted = 0;

  try {
    const items = await listMediaByTag(apiBase, config.profiles.cms.marker_tag);
    for (const item of items) {
      if (await deleteMedia(apiBase, item.id)) deleted++;
    }
  } catch {
    // ignore — cleanup is best effort
  }

  return deleted;
}
