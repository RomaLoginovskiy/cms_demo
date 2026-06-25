import { openBoardSession } from './boardSession';
import { createViewportRng } from '../pages/helpers/canvas';
import { pick, sleep } from '../util/random';
import { BehaviorContext } from './types';

export async function probeCms(config: BehaviorContext['config']): Promise<boolean> {
  const url = config.target.cms_probe_url!;
  try {
    const res = await fetch(url, { method: 'GET' });
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function runMediaPlacer(ctx: BehaviorContext): Promise<void> {
  const profile = 'media_placer';
  const cfg = ctx.config.profiles.media_placer;
  const rng = createViewportRng(ctx.config.run.seed, ctx.userIndex);

  if (cfg.skip_if_cms_unavailable) {
    const ok = await probeCms(ctx.config);
    if (!ok) {
      await sleep(5000);
      return;
    }
  }

  const wb = await openBoardSession(ctx, profile);

  while (!ctx.signal.aborted) {
    const query = pick(cfg.search_queries, rng);
    await wb.openPicturesAndPlaceFirst(query).catch(() => undefined);
    await sleep(cfg.place_interval_ms);
    await sleep(ctx.config.users.think_time_ms);
  }
}
