import { FormEvent, useEffect, useState } from 'react';
import { whiteboardApi } from '../api/whiteboardApi';
import { BoardSummary } from '../types/models';

interface BoardListProps {
  onOpenBoard: (boardId: string) => void;
}

export function BoardList({ onOpenBoard }: BoardListProps): JSX.Element {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [name, setName] = useState('New Board');
  const [error, setError] = useState<string | null>(null);

  async function loadBoards(): Promise<void> {
    setBoards(await whiteboardApi.listBoards());
  }

  useEffect(() => {
    void loadBoards().catch(() => setError('Unable to load boards.'));
  }, []);

  async function createBoard(event: FormEvent): Promise<void> {
    event.preventDefault();
    const created = await whiteboardApi.createBoard(name);
    setName('New Board');
    await loadBoards();
    onOpenBoard(created.id);
  }

  async function renameBoard(board: BoardSummary): Promise<void> {
    const nextName = window.prompt('Board name', board.name);
    if (!nextName) {
      return;
    }

    await whiteboardApi.renameBoard(board.id, nextName);
    await loadBoards();
  }

  async function deleteBoard(board: BoardSummary): Promise<void> {
    if (!window.confirm(`Delete ${board.name}?`)) {
      return;
    }

    await whiteboardApi.deleteBoard(board.id);
    await loadBoards();
  }

  return (
    <main className="board-list">
      <section className="panel hero-panel">
        <div>
          <p className="eyebrow">Local collaborative demo</p>
          <h1>Whiteboard Boards</h1>
          <p>Open the same board in multiple tabs to draw together in real time.</p>
        </div>
        <form onSubmit={(event) => void createBoard(event)} className="create-board">
          <label htmlFor="board-name">Create board</label>
          <input id="board-name" data-testid="board-name-input" value={name} onChange={(event) => setName(event.target.value)} />
          <button type="submit">Create</button>
        </form>
      </section>

      {error && <p role="alert" className="error">{error}</p>}

      <section className="panel">
        <h2>Boards</h2>
        <div className="board-grid">
          {boards.map(board => (
            <article key={board.id} className="board-card" data-testid="board-card">
              <button className="board-open" onClick={() => onOpenBoard(board.id)}>
                <strong>{board.name}</strong>
                <span>Updated {new Date(board.updatedAt).toLocaleString()}</span>
              </button>
              <div className="card-actions">
                <button onClick={() => void renameBoard(board)}>Rename</button>
                <button onClick={() => void deleteBoard(board)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
