import { LoadConfig } from '../config/types';

interface BoardSummary {
  id: string;
  name: string;
}

export async function cleanupBoardsViaRest(config: LoadConfig): Promise<number> {
  const base = config.target.frontend_base_url;
  const prefix = config.boards.name_prefix;
  let deleted = 0;

  try {
    const res = await fetch(`${base}/api/boards`);
    if (!res.ok) return 0;
    const boards = (await res.json()) as BoardSummary[];
    for (const board of boards) {
      if (!board.name.startsWith(prefix)) continue;
      const del = await fetch(`${base}/api/boards/${board.id}`, { method: 'DELETE' });
      if (del.ok || del.status === 204) deleted++;
    }
  } catch {
    // ignore
  }

  return deleted;
}
