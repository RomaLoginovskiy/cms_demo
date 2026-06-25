import { openBoardSession } from './boardSession';
import { createViewportRng } from '../pages/helpers/canvas';
import { pick, sleep, jitterMs } from '../util/random';
import { BehaviorContext } from './types';

export async function runComplexPlacer(ctx: BehaviorContext): Promise<void> {
  const profile = 'complex_placer';
  const cfg = ctx.config.profiles.complex_placer;
  const rng = createViewportRng(ctx.config.run.seed, ctx.userIndex);

  const wb = await openBoardSession(ctx, profile);

  while (!ctx.signal.aborted) {
    const template = pick(cfg.templates, rng);
    await wb.placeComplexTemplate(template.tab, template.name);
    await sleep(jitterMs(cfg.place_interval_ms, rng));
    await sleep(jitterMs(ctx.config.users.think_time_ms, rng));
  }
}
