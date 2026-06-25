interface BoardSummary {
  id: string;
  name: string;
}

interface BoardDetail {
  id: string;
  name: string;
  shapes: unknown[];
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

export async function ensureBoard(baseUrl: string, boardName: string): Promise<string> {
  const base = normalizeBaseUrl(baseUrl);
  const listRes = await fetch(`${base}/api/boards`);
  if (!listRes.ok) {
    throw new Error(`list boards failed: ${listRes.status}`);
  }

  const boards = (await listRes.json()) as BoardSummary[];
  const existing = boards.find(board => board.name === boardName);
  if (existing) {
    return existing.id;
  }

  const createRes = await fetch(`${base}/api/boards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: boardName })
  });
  if (!createRes.ok) {
    throw new Error(`create board failed: ${createRes.status}`);
  }

  const created = (await createRes.json()) as { id: string };
  return created.id;
}

export async function getShapeCount(baseUrl: string, boardId: string): Promise<number> {
  const base = normalizeBaseUrl(baseUrl);
  const res = await fetch(`${base}/api/boards/${boardId}`);
  if (!res.ok) {
    throw new Error(`get board failed: ${res.status}`);
  }

  const board = (await res.json()) as BoardDetail;
  return board.shapes.length;
}
