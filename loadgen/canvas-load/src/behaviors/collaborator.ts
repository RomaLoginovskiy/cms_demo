import { openBoardSession } from './boardSession';
import { createViewportRng, randomCanvasBox } from '../pages/helpers/canvas';
import { jitterMs, sleep } from '../util/random';
import { BehaviorContext } from './types';

export async function runCollaborator(ctx: BehaviorContext): Promise<void> {
  const profile = 'collaborator';
  const cfg = ctx.config.profiles.collaborator;
  const rng = createViewportRng(ctx.config.run.seed, ctx.userIndex);

  const wb = await openBoardSession(ctx, profile);

  let lastSelection = 0;
  let lastProperty = 0;

  while (!ctx.signal.aborted) {
    const box = await randomCanvasBox(ctx.page, rng);
    await wb.moveMouse(box.x1, box.y1).catch(() => undefined);
    await sleep(cfg.mouse_move_interval_ms);

    const now = Date.now();
    if (now - lastSelection > cfg.selection_interval_ms) {
      await wb.selectShapeAt(box.x1, box.y1).catch(() => undefined);
      lastSelection = now;
    }
    if (now - lastProperty > cfg.property_edit_interval_ms) {
      await wb.editSelectedColor().catch(() => undefined);
      lastProperty = now;
    }

    await sleep(jitterMs(ctx.config.users.think_time_ms, rng));
  }
}
