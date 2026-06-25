import { GlobalMetricsCollector } from '../engine/ActionRecorder';
import { BoardListPage } from '../pages/BoardListPage';
import { WhiteboardPage } from '../pages/WhiteboardPage';
import { createViewportRng, randomCanvasBox } from '../pages/helpers/canvas';
import { appendRumQuery } from '../rum/buildRumQuery';
import { pick, sleep } from '../util/random';
import { BehaviorContext } from './types';

export async function runChaos(ctx: BehaviorContext): Promise<void> {
  const profile = 'chaos';
  const cfg = ctx.config.chaos;
  const rng = createViewportRng(ctx.config.run.seed, ctx.userIndex + 999);
  const metrics = GlobalMetricsCollector.getInstance();
  const wb = new WhiteboardPage(ctx.page, ctx.recorder, profile);
  const boardList = new BoardListPage(ctx.page, ctx.baseUrl, ctx.recorder, profile);

  const recordChaos = async (action: string, fn: () => Promise<void>): Promise<void> => {
    metrics.chaosActions++;
    try {
      await ctx.recorder.record(profile, action, fn, { chaos: true });
    } catch {
      // chaos errors do not propagate
    }
  };

  if (cfg.dialog_auto_accept) {
    ctx.page.on('dialog', d => void d.accept());
  }

  const target = ctx.boardResolver.resolveTarget(ctx.userIndex);

  while (!ctx.signal.aborted) {
    const roll = rng();

    if (roll < cfg.invalid_route_probability) {
      await recordChaos('invalidRoute', async () => {
        await ctx.page.goto(
          appendRumQuery(
            `${ctx.baseUrl}/boards/00000000-0000-0000-0000-000000000000`,
            ctx.rumQuery ?? ''
          )
        );
        await sleep(1000);
      });
    } else if (roll < cfg.invalid_route_probability + cfg.reload_probability) {
      await recordChaos('reload', async () => {
        await ctx.page.reload();
        await sleep(500);
      });
    } else if (roll < cfg.invalid_route_probability + cfg.reload_probability + cfg.spam_tools_probability) {
      await recordChaos('spamTools', async () => {
        const tools = ['Rectangle', 'Ellipse', 'Sticky', 'Line', 'Select'];
        for (let i = 0; i < 10; i++) {
          await ctx.page.getByRole('button', { name: pick(tools, rng), exact: true }).click();
        }
      });
    } else {
      await recordChaos('churnNav', async () => {
        await boardList.goto(ctx.rumQuery);
        if (target.boardId) {
          await wb.goto(appendRumQuery(`${ctx.baseUrl}/boards/${target.boardId}`, ctx.rumQuery ?? ''));
        } else {
          await boardList.openBoard(target.boardName).catch(() => undefined);
        }
        const box = await randomCanvasBox(ctx.page, rng);
        await wb.drawShape('Rectangle', box).catch(() => undefined);
        await ctx.page.reload().catch(() => undefined);
      });
    }

    await sleep(200);
  }
}
