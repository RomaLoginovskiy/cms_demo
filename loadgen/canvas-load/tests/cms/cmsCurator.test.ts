import { runCmsCurator } from '../../src/behaviors/cmsCurator';
import { BehaviorContext } from '../../src/behaviors/types';
import { addOwnedMedia, ownedMedia, resetOwnedMedia } from '../../src/cms/ownedMedia';
import { defaultConfig } from '../../src/config/defaults';
import { LoadConfig } from '../../src/config/types';
import { CmsPage } from '../../src/pages/CmsPage';

jest.mock('../../src/pages/CmsPage');
jest.mock('../../src/util/random', () => ({
  ...jest.requireActual('../../src/util/random'),
  sleep: jest.fn().mockResolvedValue(undefined)
}));

const MockCmsPage = CmsPage as jest.MockedClass<typeof CmsPage>;

function makeCtx(abandonProbability: number, rng: () => number = () => 0.5): BehaviorContext {
  const config = JSON.parse(JSON.stringify(defaultConfig)) as LoadConfig;
  config.profiles.cms.abandon_probability = abandonProbability;
  return {
    config,
    userIndex: 4,
    rng,
    signal: new AbortController().signal,
    baseUrl: 'http://cms-frontend/cms',
    rumQuery: 'rum_user=x'
  } as unknown as BehaviorContext;
}

function calls(): string[] {
  const instance = MockCmsPage.mock.instances[0]!;
  const order: Array<[number, string]> = [];
  for (const name of Object.getOwnPropertyNames(CmsPage.prototype)) {
    if (name === 'constructor') continue;
    const fn = (instance as unknown as Record<string, jest.Mock>)[name];
    if (!fn?.mock) continue;
    fn.mock.invocationCallOrder.forEach((seq, i) => {
      const arg = fn.mock.calls[i]?.[0];
      order.push([seq, typeof arg === 'string' && name === 'clickNav' ? `${name}:${arg}` : name]);
    });
  }
  return order.sort((a, b) => a[0] - b[0]).map(([, name]) => name);
}

describe('runCmsCurator', () => {
  beforeEach(() => {
    resetOwnedMedia();
    jest.clearAllMocks();
    MockCmsPage.prototype.submitUpload.mockResolvedValue('media-1');
    MockCmsPage.prototype.filterByTag.mockResolvedValue(true);
  });

  it('runs the full lifecycle and forgets the deleted item', async () => {
    await runCmsCurator(makeCtx(0));

    expect(calls()).toEqual([
      'openGallery',
      'clickNav:upload',
      'selectFile',
      'fillUploadDetails',
      'addUploadTag',
      'addUploadTag',
      'submitUpload',
      'clickNav:gallery',
      'clearFilters',
      'filterByTag',
      'openMedia',
      'editAndSave',
      'deleteOpenMedia',
      'clearFilters'
    ]);
    expect(MockCmsPage.prototype.addUploadTag).toHaveBeenNthCalledWith(1, 'loadgen');
    expect(MockCmsPage.prototype.deleteOpenMedia).toHaveBeenCalledWith('media-1');
    expect(ownedMedia(4)).toEqual([]);
  });

  it('stops at the first step when the user abandons', async () => {
    await runCmsCurator(makeCtx(1));

    expect(calls()).toEqual(['openGallery']);
  });

  it('prunes the oldest owned item first when at the cap', async () => {
    for (let i = 0; i < 5; i++) addOwnedMedia(4, `old-${i}`);

    await runCmsCurator(makeCtx(0));

    expect(MockCmsPage.prototype.openMedia).toHaveBeenNthCalledWith(1, 'old-0');
    expect(MockCmsPage.prototype.deleteOpenMedia).toHaveBeenNthCalledWith(1, 'old-0');
    expect(ownedMedia(4)).toEqual(['old-1', 'old-2', 'old-3', 'old-4']);
  });
});
