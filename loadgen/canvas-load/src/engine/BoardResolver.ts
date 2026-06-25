import { LoadConfig } from '../config/types';

export interface BoardTarget {
  boardId: string | null;
  boardName: string;
  url: string;
}

export class BoardResolver {
  private sharedBoardId: string | null = null;
  private readonly perUserBoards = new Map<number, string>();

  constructor(private config: LoadConfig) {}

  updateConfig(config: LoadConfig): void {
    this.config = config;
  }

  resetBoardState(): void {
    this.sharedBoardId = null;
    this.perUserBoards.clear();
  }

  private getBaseUrl(): string {
    return this.config.target.frontend_base_url;
  }

  getSharedBoardName(): string {
    return (
      this.config.boards.shared_board_name ??
      `${this.config.boards.name_prefix}-${this.config.run.run_id}`
    );
  }

  getPoolBoardName(userIndex: number): string {
    const n = userIndex % this.config.boards.pool_size;
    return `${this.config.boards.name_prefix}-${this.config.run.run_id}-pool-${n}`;
  }

  getPerUserBoardName(userIndex: number): string {
    return `${this.config.boards.name_prefix}-${this.config.run.run_id}-user-${userIndex}`;
  }

  setSharedBoardId(id: string): void {
    this.sharedBoardId = id;
  }

  getSharedBoardId(): string | null {
    return this.config.boards.shared_board_id ?? this.sharedBoardId;
  }

  setPerUserBoardId(userIndex: number, id: string): void {
    this.perUserBoards.set(userIndex, id);
  }

  resolveTarget(userIndex: number): BoardTarget {
    const baseUrl = this.getBaseUrl();
    const mode = this.config.boards.mode;

    if (mode === 'shared') {
      const id = this.getSharedBoardId();
      const name = this.getSharedBoardName();
      return {
        boardId: id,
        boardName: name,
        url: id ? `${baseUrl}/boards/${id}` : `${baseUrl}/`
      };
    }

    if (mode === 'pool') {
      const name = this.getPoolBoardName(userIndex);
      const id = this.perUserBoards.get(userIndex) ?? null;
      return {
        boardId: id,
        boardName: name,
        url: id ? `${baseUrl}/boards/${id}` : `${baseUrl}/`
      };
    }

    const name = this.getPerUserBoardName(userIndex);
    const id = this.perUserBoards.get(userIndex) ?? null;
    return {
      boardId: id,
      boardName: name,
      url: id ? `${baseUrl}/boards/${id}` : `${baseUrl}/`
    };
  }

  extractBoardIdFromUrl(url: string): string | null {
    const m = url.match(/\/boards\/([0-9a-f-]{36})/i);
    return m?.[1] ?? null;
  }
}
