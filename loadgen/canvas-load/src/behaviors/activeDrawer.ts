import { openBoardSession } from './boardSession';
import { createViewportRng, randomCanvasBox } from '../pages/helpers/canvas';
import { jitterMs, pick, sleep } from '../util/random';
import { BehaviorContext } from './types';

export async function runActiveDrawer(ctx: BehaviorContext): Promise<void> {
  const profile = 'active_drawer';
  const cfg = ctx.config.profiles.active_drawer;
  const rng = createViewportRng(ctx.config.run.seed, ctx.userIndex);

  const wb = await openBoardSession(ctx, profile);

  while (!ctx.signal.aborted) {
    const tool = pick(cfg.tools, rng);
    const box = await randomCanvasBox(ctx.page, rng);

    const count = await wb.getShapeCount();
    if (count > cfg.max_shapes_before_delete) {
      await wb.selectTool('Select');
      await wb.selectShapeAt(box.x1, box.y1);
      await wb.deleteSelection();
    } else {
      await wb.drawShape(tool, box);
      if (rng() < cfg.select_and_move_probability) {
        await wb.selectTool('Select');
        await wb.selectShapeAt(box.x2, box.y2);
      }
    }

    await sleep(jitterMs(cfg.draw_interval_ms, rng));
    await sleep(jitterMs(ctx.config.users.think_time_ms, rng));
  }
}
