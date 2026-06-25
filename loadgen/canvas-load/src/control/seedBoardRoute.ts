import express from 'express';
import { BrowserLoadEngine } from '../engine/BrowserLoadEngine';
import { resolveTargetUrl } from '../config/resolveTargetUrl';
import { seedBoard } from '../seed/seedBoard';
import { SeedBoardRequest, SeedBoardResponse } from '../seed/types';

const DEFAULT_BOARD_NAME = 'loadgen-large';
const DEFAULT_TARGET_COUNT = 1300;
const DEFAULT_BATCH_SIZE = 25;

let seedInProgress = false;

export function isSeedInProgress(): boolean {
  return seedInProgress;
}

export function resetSeedInProgressForTests(): void {
  seedInProgress = false;
}

export function validateSeedBoardRequest(body: unknown): { ok: true; value: Required<SeedBoardRequest> } | { ok: false; error: string } {
  const input = (body ?? {}) as SeedBoardRequest;
  const boardName = input.board_name?.trim() || DEFAULT_BOARD_NAME;
  const targetCount = input.target_count ?? DEFAULT_TARGET_COUNT;
  const batchSize = input.batch_size ?? DEFAULT_BATCH_SIZE;

  if (!boardName || boardName.length > 128) {
    return { ok: false, error: 'board_name must be non-empty and at most 128 characters' };
  }
  if (!Number.isFinite(targetCount) || !Number.isInteger(targetCount) || targetCount < 1 || targetCount > 5000) {
    return { ok: false, error: 'target_count must be an integer between 1 and 5000' };
  }
  if (!Number.isFinite(batchSize) || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    return { ok: false, error: 'batch_size must be an integer between 1 and 100' };
  }

  return {
    ok: true,
    value: {
      board_name: boardName,
      target_count: targetCount,
      batch_size: batchSize
    }
  };
}

export function registerSeedBoardRoute(app: express.Application, engine: BrowserLoadEngine): void {
  app.post('/api/control/seed-board', async (req, res) => {
    if (seedInProgress) {
      res.status(409).json({ error: 'seed already in progress' });
      return;
    }

    const validation = validateSeedBoardRequest(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const state = engine.getStateSnapshot();
    if (!state.frontendReachable) {
      res.status(503).json({
        error: 'frontend unreachable',
        effectiveBaseUrl: resolveTargetUrl(engine.getConfig()).url
      });
      return;
    }

    const effectiveBaseUrl = resolveTargetUrl(engine.getConfig()).url;
    seedInProgress = true;

    try {
      const result = await seedBoard({
        baseUrl: effectiveBaseUrl,
        boardName: validation.value.board_name,
        targetCount: validation.value.target_count,
        batchSize: validation.value.batch_size
      });

      const response: SeedBoardResponse = {
        ...result,
        effectiveBaseUrl
      };
      res.json(response);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
        effectiveBaseUrl
      });
    } finally {
      seedInProgress = false;
    }
  });
}
