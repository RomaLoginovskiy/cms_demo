import { pick } from '../util/random';
import { createCmsPage, endTransaction, nextStep } from './cmsFlows';
import { BehaviorContext } from './types';

/** Read-only visit: gallery → tag filter → open/close an item → stats/about. */
export async function runCmsBrowser(ctx: BehaviorContext): Promise<void> {
  const cms = createCmsPage(ctx, 'cms_browser');

  await cms.openGallery();
  if (!(await nextStep(ctx))) return endTransaction(ctx);

  await cms.clearFilters();
  const filtered = await cms.filterByTag(pick(ctx.config.profiles.cms.tag_vocabulary, ctx.rng));
  if (filtered && !(await nextStep(ctx))) return endTransaction(ctx);

  if (await cms.openRandomMedia(ctx.rng)) {
    if (!(await nextStep(ctx))) return endTransaction(ctx);
    await cms.closeModal();
  }
  await cms.clearFilters();

  if (ctx.rng() < 0.5 && (await nextStep(ctx))) {
    await cms.clickNav('stats');
  }
  if (ctx.rng() < 0.2 && (await nextStep(ctx))) {
    await cms.clickNav('about');
  }

  await endTransaction(ctx);
}
