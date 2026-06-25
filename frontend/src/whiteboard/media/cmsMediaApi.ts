import { Media as CmsMedia } from '../../types';

const MediaPath = '/api/media';

export function resolveCmsMediaBaseUrl(): string {
  const configured = process.env.REACT_APP_CMS_API_URL;
  return trimTrailingSlashes(configured ?? '');
}

async function fetchMedia(path: string): Promise<CmsMedia[]> {
  const response = await fetch(buildCmsUrl(path));
  if (!response.ok) {
    throw new Error(`CMS media request failed: ${response.status}`);
  }

  const media = (await response.json()) as CmsMedia[];
  return media.filter(item => item.contentType.toLowerCase().startsWith('image/'));
}

async function listImages(query = ''): Promise<CmsMedia[]> {
  const images = await fetchMedia(MediaPath);
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return images;
  }

  return images.filter(item => {
    const haystack = `${item.title ?? ''} ${item.fileName} ${item.description ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

async function filterByTags(tags: string[]): Promise<CmsMedia[]> {
  const tagsParam = tags.map(tag => tag.trim()).filter(Boolean).join(',');
  if (!tagsParam) {
    return listImages();
  }

  return fetchMedia(`${MediaPath}/filter?tags=${encodeURIComponent(tagsParam)}`);
}

function fileUrl(id: string): string {
  return buildCmsUrl(`${MediaPath}/${encodeURIComponent(id)}/file`);
}

function buildCmsUrl(path: string): string {
  const baseUrl = resolveCmsMediaBaseUrl();
  if (!baseUrl) {
    return path;
  }

  if (baseUrl.endsWith('/api') && path.startsWith('/api/')) {
    return `${baseUrl}${path.slice('/api'.length)}`;
  }

  return `${baseUrl}${path}`;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

export const cmsMediaApi = {
  listImages,
  filterByTags,
  fileUrl
};
