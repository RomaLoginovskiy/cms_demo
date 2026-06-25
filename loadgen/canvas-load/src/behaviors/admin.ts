import { BoardListPage } from '../pages/BoardListPage';
import { WhiteboardPage } from '../pages/WhiteboardPage';
import { createViewportRng } from '../pages/helpers/canvas';
import { jitterMs, randomInt, sleep } from '../util/random';
import { BehaviorContext } from './types';

export async function runAdmin(ctx: BehaviorContext): Promise<void> {
  const profile = 'admin';
  const boardList = new BoardListPage(ctx.page, ctx.baseUrl, ctx.recorder, profile);
  const wb = new WhiteboardPage(ctx.page, ctx.recorder, profile);
  const cfg = ctx.config.profiles.admin;
  const rng = createViewportRng(ctx.config.run.seed, ctx.userIndex);
  const prefix = ctx.config.boards.name_prefix;
  const runId = ctx.config.run.run_id;

  while (!ctx.signal.aborted) {
    await boardList.goto(ctx.rumQuery);
    const count = randomInt(cfg.boards_per_session_min, cfg.boards_per_session_max, rng);

    for (let i = 0; i < count && !ctx.signal.aborted; i++) {
      const name = `${prefix}-${runId}-admin-${ctx.userIndex}-${Date.now()}`;
      await boardList.createBoard(name).catch(() => undefined);
      await boardList.goto(ctx.rumQuery);

      if (rng() < cfg.rename_probability) {
        await boardList.renameFirstLoadgenBoard(`${name}-renamed`, prefix).catch(() => undefined);
      }
      if (rng() < cfg.delete_probability) {
        await boardList.deleteBoardsMatching(`${prefix}-${runId}-admin`).catch(() => undefined);
      }
      if (rng() < 0.3) {
        await boardList.openBoard(name).catch(() => undefined);
        await wb.goBack().catch(() => undefined);
      }
    }

    await sleep(cfg.time_on_list_ms);
    await sleep(jitterMs(ctx.config.users.think_time_ms, rng));
  }
}
