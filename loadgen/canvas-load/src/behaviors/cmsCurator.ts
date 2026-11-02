import {
  createCmsPage,
  deleteOpenMediaFlow,
  editMediaFlow,
  endTransaction,
  nextStep,
  pruneOwnedMedia,
  uploadMediaFlow
} from './cmsFlows';
import { BehaviorContext } from './types';

/** Full media lifecycle: upload → filter → open → edit → save → delete, with drop-off at every step. */
export async function runCmsCurator(ctx: BehaviorContext): Promise<void> {
  const cms = createCmsPage(ctx, 'cms_curator');

  await cms.openGallery();
  await pruneOwnedMedia(ctx, cms);
  if (!(await nextStep(ctx))) return endTransaction(ctx);

  const uploaded = await uploadMediaFlow(ctx, cms);
  if (!uploaded || !(await nextStep(ctx))) return endTransaction(ctx);

  const edited = await editMediaFlow(ctx, cms, uploaded);
  if (!edited) return endTransaction(ctx);

  if (await nextStep(ctx)) {
    await deleteOpenMediaFlow(ctx, cms, uploaded.id);
    await cms.clearFilters();
  } else {
    await cms.closeModal();
  }

  await endTransaction(ctx);
}
