import { LoadConfig } from '../config/types';
import { ensureBoard } from '../seed/boardApi';

/** Ensure a board exists via REST (nginx proxies /api on canvas-frontend). */
export async function provisionBoardId(config: LoadConfig, boardName: string): Promise<string> {
  return ensureBoard(config.target.frontend_base_url, boardName);
}
