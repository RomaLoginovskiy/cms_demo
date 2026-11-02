import { cleanupCmsMedia } from '../../src/cms/cmsApi';
import { defaultConfig } from '../../src/config/defaults';
import { LoadConfig } from '../../src/config/types';

function cmsConfig(): LoadConfig {
  const cfg = JSON.parse(JSON.stringify(defaultConfig)) as LoadConfig;
  cfg.target.app = 'cms';
  cfg.target.frontend_base_url = 'http://cms-frontend/cms';
  return cfg;
}

describe('cleanupCmsMedia', () => {
  afterEach(() => jest.restoreAllMocks());

  it('deletes every item with the marker tag via the origin API', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 'a' }, { id: 'b' }]), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(cleanupCmsMedia(cmsConfig())).resolves.toBe(2);

    expect(fetchSpy.mock.calls[0]![0]).toBe('http://cms-frontend/api/media/filter?tags=loadgen');
    expect(fetchSpy.mock.calls[1]![0]).toBe('http://cms-frontend/api/media/a');
    expect(fetchSpy.mock.calls[1]![1]).toMatchObject({ method: 'DELETE' });
    expect(fetchSpy.mock.calls[2]![0]).toBe('http://cms-frontend/api/media/b');
  });

  it('returns 0 when the CMS API is unavailable', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(cleanupCmsMedia(cmsConfig())).resolves.toBe(0);
  });
});
