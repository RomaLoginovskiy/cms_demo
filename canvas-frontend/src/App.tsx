import { useEffect, useState } from 'react';
import './styles.css';
import { RumDemoPanel } from './observability/rumDemoPanel/RumDemoPanel';
import { BoardList } from './whiteboard/components/BoardList';
import { WhiteboardPage } from './whiteboard/components/WhiteboardPage';

function currentBoardId(): string | null {
  const match = window.location.pathname.match(/^\/boards\/([^/]+)$/);
  return match?.[1] ?? null;
}

export default function App(): JSX.Element {
  const [boardId, setBoardId] = useState<string | null>(() => currentBoardId());

  useEffect(() => {
    function onPopState(): void {
      setBoardId(currentBoardId());
    }

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function openBoard(id: string): void {
    window.history.pushState(null, '', `/boards/${id}`);
    setBoardId(id);
  }

  function backToBoards(): void {
    window.history.pushState(null, '', '/');
    setBoardId(null);
  }

  return (
    <>
      {boardId ? <WhiteboardPage boardId={boardId} onBack={backToBoards} /> : <BoardList onOpenBoard={openBoard} />}
      <RumDemoPanel />
    </>
  );
}
