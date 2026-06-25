import { cmsMediaApi, resolveCmsMediaBaseUrl } from './cmsMediaApi';
import { CmsMedia } from '../types/models';

const imageFixture: CmsMedia = {
  id: '11111111-1111-4111-8111-111111111111',
  fileName: 'welcome.png',
  title: 'Welcome Image',
  description: 'Fixture image for whiteboard placement',
  contentType: 'image/png',
  size: 128,
  uploadedAt: '2026-05-25T00:00:00Z',
  tags: ['demo']
};

const documentFixture: CmsMedia = {
  ...imageFixture,
  id: '22222222-2222-4222-8222-222222222222',
  fileName: 'notes.pdf',
  title: 'Notes',
  contentType: 'application/pdf'
};

describe('cmsMediaApi', () => {
  const originalCmsApiUrl = process.env.REACT_APP_CMS_API_URL;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    setEnv('REACT_APP_CMS_API_URL', undefined);
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = fetchMock;
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
    setEnv('REACT_APP_CMS_API_URL', originalCmsApiUrl);
  });

  it('loads images from relative CMS media endpoint when base URL is empty', async () => {
    setEnv('REACT_APP_CMS_API_URL', '');
    fetchMock.mockResolvedValue(jsonResponse([imageFixture, documentFixture]));

    await expect(cmsMediaApi.listImages()).resolves.toEqual([imageFixture]);

    expect(fetchMock).toHaveBeenCalledWith('/api/media');
  });

  it('uses configured CMS API URL when provided', async () => {
    setEnv('REACT_APP_CMS_API_URL', 'http://localhost:5041');
    fetchMock.mockResolvedValue(jsonResponse([imageFixture, documentFixture]));

    await cmsMediaApi.listImages();

    expect(resolveCmsMediaBaseUrl()).toBe('http://localhost:5041');
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5041/api/media');
  });

  it('filters CMS images by search text', async () => {
    fetchMock.mockResolvedValue(jsonResponse([imageFixture, documentFixture]));

    const images = await cmsMediaApi.listImages('welcome');

    expect(images).toEqual([imageFixture]);
    expect(fetchMock).toHaveBeenCalledWith('/api/media');
  });

  it('uses tag filter endpoint for explicit tag filters', async () => {
    fetchMock.mockResolvedValue(jsonResponse([imageFixture]));

    await cmsMediaApi.filterByTags(['demo', 'whiteboard']);

    expect(fetchMock).toHaveBeenCalledWith('/api/media/filter?tags=demo%2Cwhiteboard');
  });

  it('throws when CMS media request fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'nope' }, false, 500));

    await expect(cmsMediaApi.listImages()).rejects.toThrow('CMS media request failed: 500');
  });

  it('builds file URLs from configured CMS API base URL', () => {
    setEnv('REACT_APP_CMS_API_URL', 'http://cms.example.test/api/');

    expect(resolveCmsMediaBaseUrl()).toBe('http://cms.example.test/api');
    expect(cmsMediaApi.fileUrl(imageFixture.id)).toBe(
      'http://cms.example.test/api/media/11111111-1111-4111-8111-111111111111/file'
    );
  });
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

function setEnv(key: 'REACT_APP_CMS_API_URL', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
