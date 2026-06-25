import { openBoardSession } from './boardSession';
import { jitterMs, sleep } from '../util/random';
import { BehaviorContext } from './types';

const LARGE_BOARD_NAME = 'loadgen-large';

export async function runTextEditor(ctx: BehaviorContext): Promise<void> {
  const profile = 'text_editor';
  const cfg = ctx.config.profiles.text_editor;
  const boardName = ctx.config.boards.shared_board_name ?? LARGE_BOARD_NAME;

  const target = ctx.boardResolver.resolveTarget(ctx.userIndex);
  if (!target.boardName) {
    target.boardName = boardName;
  }

  const wb = await openBoardSession(ctx, profile);
  const count = await wb.getShapeCount();
  if (count < cfg.min_shapes) {
    console.warn(`[text_editor] board has ${count} shapes (need ${cfg.min_shapes}); run seed-board first`);
  }

  let editIndex = ctx.userIndex;

  while (!ctx.signal.aborted) {
    const x = 80 + (editIndex % 20) * 45;
    const y = 80 + Math.floor(editIndex / 20) * 40;
    editIndex++;

    await wb.editStickyText(x, y, `edit-${ctx.userIndex}-${editIndex}-${Date.now()}`);
    await sleep(jitterMs(cfg.edit_interval_ms, () => Math.random()));
    await sleep(jitterMs(ctx.config.users.think_time_ms, () => Math.random()));
  }
}
