import { createCmsPage, endTransaction, nextStep, pruneOwnedMedia, uploadMediaFlow } from './cmsFlows';
import { BehaviorContext } from './types';

/** One Add-media transaction, then back to the gallery to look at the result. */
export async function runCmsUploader(ctx: BehaviorContext): Promise<void> {
  const cms = createCmsPage(ctx, 'cms_uploader');

  await cms.openGallery();
  await pruneOwnedMedia(ctx, cms);
  if (!(await nextStep(ctx))) return endTransaction(ctx);

  const uploaded = await uploadMediaFlow(ctx, cms);
  if (uploaded && (await nextStep(ctx))) {
    await cms.clickNav('gallery');
  }

  await endTransaction(ctx);
}
