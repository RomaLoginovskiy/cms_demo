import { addOwnedMedia, ownedMedia, removeOwnedMedia } from '../cms/ownedMedia';
import { generatePng } from '../cms/pngFactory';
import { CmsPage } from '../pages/CmsPage';
import { jitterMs, pick, randomInt, sleep } from '../util/random';
import { BehaviorContext } from './types';

const ADJECTIVES = ['Amber', 'Quiet', 'Bright', 'Coastal', 'Urban', 'Golden', 'Misty', 'Bold'] as const;
const NOUNS = ['Harbor', 'Summit', 'Launch', 'Workshop', 'Skyline', 'Market', 'Meadow', 'Studio'] as const;
const DESCRIPTIONS = [
  'Hero image for the spring campaign',
  'Team photo from the quarterly offsite',
  'Product shot for the catalog refresh',
  'Event banner for the partner summit',
  'Archive copy of the brand guidelines cover'
] as const;

export interface UploadedMedia {
  id: string;
  tag: string;
}

export function createCmsPage(ctx: BehaviorContext, profile: string): CmsPage {
  return new CmsPage(ctx.page, ctx.recorder, profile, ctx.baseUrl, ctx.rumQuery ?? '');
}

/** Pause between funnel steps. Returns false when the user stops (aborted) or walks away (abandon). */
export async function nextStep(ctx: BehaviorContext): Promise<boolean> {
  const cfg = ctx.config.profiles.cms;
  await sleep(jitterMs(cfg.step_think_ms, ctx.rng));
  if (ctx.signal.aborted) return false;
  return ctx.rng() >= cfg.abandon_probability;
}

export async function endTransaction(ctx: BehaviorContext): Promise<void> {
  await sleep(jitterMs(Math.max(ctx.config.users.think_time_ms, 1), ctx.rng));
}

function mediaTitle(ctx: BehaviorContext): string {
  return `${pick(ADJECTIVES, ctx.rng)} ${pick(NOUNS, ctx.rng)} ${randomInt(1, 999, ctx.rng)}`;
}

function mediaDescription(ctx: BehaviorContext): string {
  return pick(DESCRIPTIONS, ctx.rng);
}

/**
 * Add-media funnel: nav Upload → pick file → details → tags → Upload All.
 * Returns null when the user abandons before submitting.
 */
export async function uploadMediaFlow(
  ctx: BehaviorContext,
  cms: CmsPage
): Promise<UploadedMedia | null> {
  const cfg = ctx.config.profiles.cms;

  await cms.clickNav('upload');
  if (!(await nextStep(ctx))) return null;

  await cms.selectFile({
    name: `loadgen-${Date.now()}-${ctx.userIndex}.png`,
    buffer: generatePng(ctx.rng)
  });
  if (!(await nextStep(ctx))) return null;

  await cms.fillUploadDetails(mediaTitle(ctx), mediaDescription(ctx));
  const tag = pick(cfg.tag_vocabulary, ctx.rng);
  await cms.addUploadTag(cfg.marker_tag);
  await cms.addUploadTag(tag);
  if (!(await nextStep(ctx))) return null;

  const id = await cms.submitUpload();
  addOwnedMedia(ctx.userIndex, id);
  return { id, tag };
}

/** Edit funnel on an item the user owns: filter by its tag → open → edit → save. Leaves the modal open. */
export async function editMediaFlow(
  ctx: BehaviorContext,
  cms: CmsPage,
  media: UploadedMedia
): Promise<boolean> {
  await cms.clickNav('gallery');
  if (!(await nextStep(ctx))) return false;

  // Tag filters live in app state and survive navigation; a leftover one could hide the item.
  await cms.clearFilters();
  await cms.filterByTag(media.tag);
  if (!(await nextStep(ctx))) return false;

  await cms.openMedia(media.id);
  if (!(await nextStep(ctx))) {
    await cms.closeModal();
    return false;
  }

  await cms.editAndSave(media.id, mediaTitle(ctx), mediaDescription(ctx));
  return true;
}

/** Remove funnel tail for the media open in the modal. */
export async function deleteOpenMediaFlow(ctx: BehaviorContext, cms: CmsPage, id: string): Promise<void> {
  await cms.deleteOpenMedia(id);
  removeOwnedMedia(ctx.userIndex, id);
}

/**
 * Keeps each user's inventory bounded: once it owns max_owned_items (e.g. after
 * abandoned edits), it deletes the oldest through the UI — itself a Remove funnel.
 */
export async function pruneOwnedMedia(ctx: BehaviorContext, cms: CmsPage): Promise<void> {
  const cfg = ctx.config.profiles.cms;
  while (!ctx.signal.aborted && ownedMedia(ctx.userIndex).length >= cfg.max_owned_items) {
    const oldest = ownedMedia(ctx.userIndex)[0]!;
    try {
      await cms.clearFilters();
      await cms.openMedia(oldest);
      await sleep(jitterMs(cfg.step_think_ms, ctx.rng));
      await deleteOpenMediaFlow(ctx, cms, oldest);
    } catch (err) {
      // Item is gone (cleanup, another run) — stop tracking it so the loop can't spin on it.
      removeOwnedMedia(ctx.userIndex, oldest);
      throw err;
    }
    await sleep(jitterMs(cfg.step_think_ms, ctx.rng));
  }
}
