import { HubConnectionBuilder } from '@microsoft/signalr';
import { randomUUID } from 'crypto';
import { ensureBoard, getShapeCount } from './boardApi';
import { buildSticky } from './stickyShape';
import { SeedOptions, SeedResult } from './types';

const DEFAULT_BOARD_NAME = 'loadgen-large';
const DEFAULT_TARGET_COUNT = 1300;
const DEFAULT_BATCH_SIZE = 25;

export async function seedBoard(options: SeedOptions): Promise<SeedResult> {
  const startedAt = Date.now();
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  const boardName = options.boardName ?? DEFAULT_BOARD_NAME;
  const targetCount = Math.max(1, options.targetCount ?? DEFAULT_TARGET_COUNT);
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const onProgress = options.onProgress;

  const boardId = await ensureBoard(baseUrl, boardName);
  const existingCount = await getShapeCount(baseUrl, boardId);

  if (existingCount >= targetCount) {
    return {
      boardId,
      boardName,
      existingCount,
      createdCount: 0,
      finalCount: existingCount,
      skipped: true,
      durationMs: Date.now() - startedAt
    };
  }

  const toCreate = targetCount - existingCount;
  const hubUrl = `${baseUrl}/hubs/board`;
  const connection = new HubConnectionBuilder().withUrl(hubUrl).build();
  let created = 0;

  try {
    await connection.start();
    await connection.invoke('JoinBoard', boardId, randomUUID(), 'Seeder', '#111827');

    while (created < toCreate) {
      const batch = Math.min(batchSize, toCreate - created);
      const promises: Promise<void>[] = [];
      for (let i = 0; i < batch; i++) {
        const shape = buildSticky(boardId, existingCount + created + i);
        promises.push(connection.invoke('CreateShape', boardId, shape));
      }
      await Promise.all(promises);
      created += batch;
      onProgress?.({ created, total: toCreate });
    }
  } finally {
    await connection.stop().catch(() => undefined);
  }

  const finalCount = await getShapeCount(baseUrl, boardId);

  return {
    boardId,
    boardName,
    existingCount,
    createdCount: created,
    finalCount,
    skipped: false,
    durationMs: Date.now() - startedAt
  };
}
