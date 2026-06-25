import { openBoardSession } from './boardSession';
import { createViewportRng, randomCanvasBox } from '../pages/helpers/canvas';
import { jitterMs, sleep } from '../util/random';
import { BehaviorContext } from './types';

export async function runLurker(ctx: BehaviorContext): Promise<void> {
  const profile = 'lurker';
  const cfg = ctx.config.profiles.lurker;
  const rng = createViewportRng(ctx.config.run.seed, ctx.userIndex);

  const wb = await openBoardSession(ctx, profile);

  while (!ctx.signal.aborted) {
    if (rng() < cfg.mouse_move_probability) {
      const box = await randomCanvasBox(ctx.page, rng);
      await wb.moveMouse(box.x1, box.y1).catch(() => undefined);
      await sleep(cfg.mouse_move_interval_ms);
    }
    await sleep(jitterMs(ctx.config.users.think_time_ms, rng));
  }
}
