import { provisionBoardId } from '../engine/boardProvision';
import { BoardListPage } from '../pages/BoardListPage';
import { WhiteboardPage } from '../pages/WhiteboardPage';
import { BehaviorContext } from './types';

/** Open board by REST provision + direct URL (reliable in headless load tests). */
export async function openBoardSession(
  ctx: BehaviorContext,
  profile: string
): Promise<WhiteboardPage> {
  const wb = new WhiteboardPage(ctx.page, ctx.recorder, profile);
  const target = ctx.boardResolver.resolveTarget(ctx.userIndex);
  let boardId = target.boardId;

  if (!boardId) {
    boardId = await provisionBoardId(ctx.config, target.boardName);
    if (ctx.config.boards.mode === 'shared') {
      ctx.boardResolver.setSharedBoardId(boardId);
    } else {
      ctx.boardResolver.setPerUserBoardId(ctx.userIndex, boardId);
    }
  }

  const boardList = new BoardListPage(ctx.page, ctx.baseUrl, ctx.recorder, profile);
  await boardList.openBoardById(boardId, ctx.rumQuery);
  await wb.waitReady();
  return wb;
}
