export interface SeedProgress {
  created: number;
  total: number;
}

export interface SeedOptions {
  baseUrl: string;
  boardName?: string;
  targetCount?: number;
  batchSize?: number;
  onProgress?: (progress: SeedProgress) => void;
}

export interface SeedResult {
  boardId: string;
  boardName: string;
  existingCount: number;
  createdCount: number;
  finalCount: number;
  skipped: boolean;
  durationMs: number;
}

export interface SeedBoardRequest {
  board_name?: string;
  target_count?: number;
  batch_size?: number;
}

export interface SeedBoardResponse extends SeedResult {
  effectiveBaseUrl: string;
}
