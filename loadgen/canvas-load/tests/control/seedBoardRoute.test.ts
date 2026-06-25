import express from 'express';
import http from 'http';
import { defaultConfig } from '../../src/config/defaults';
import { LoadConfig } from '../../src/config/types';
import {
  isSeedInProgress,
  registerSeedBoardRoute,
  resetSeedInProgressForTests,
  validateSeedBoardRequest
} from '../../src/control/seedBoardRoute';
import { seedBoard } from '../../src/seed/seedBoard';

jest.mock('../../src/seed/seedBoard', () => ({
  seedBoard: jest.fn()
}));

const mockedSeedBoard = seedBoard as jest.MockedFunction<typeof seedBoard>;

function createMockEngine(overrides: {
  frontendReachable?: boolean;
  frontend_base_url?: string;
} = {}) {
  const config = JSON.parse(JSON.stringify(defaultConfig)) as LoadConfig;
  config.target.frontend_base_url = overrides.frontend_base_url ?? 'http://localhost';

  return {
    getConfig: () => config,
    getStateSnapshot: () => ({
      frontendReachable: overrides.frontendReachable ?? true,
      effectiveTargetUrl: config.target.frontend_base_url
    })
  };
}

async function withServer(
  engine: ReturnType<typeof createMockEngine>,
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const app = express();
  app.use(express.json());
  registerSeedBoardRoute(app, engine as never);
  const server = http.createServer(app);

  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind test server');
  }

  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  }
}

describe('validateSeedBoardRequest', () => {
  it('accepts defaults', () => {
    const result = validateSeedBoardRequest({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        board_name: 'loadgen-large',
        target_count: 1300,
        batch_size: 25
      });
    }
  });

  it('rejects invalid target_count', () => {
    const result = validateSeedBoardRequest({ target_count: 9000 });
    expect(result.ok).toBe(false);
  });
});

describe('seedBoardRoute', () => {
  beforeEach(() => {
    resetSeedInProgressForTests();
    mockedSeedBoard.mockReset();
    mockedSeedBoard.mockResolvedValue({
      boardId: 'board-1',
      boardName: 'loadgen-large',
      existingCount: 0,
      createdCount: 1300,
      finalCount: 1300,
      skipped: false,
      durationMs: 1000
    });
  });

  it('SEED-02: uses effective target from engine config', async () => {
    const engine = createMockEngine({ frontend_base_url: 'http://canvas-frontend' });

    await withServer(engine, async baseUrl => {
      const res = await fetch(`${baseUrl}/api/control/seed-board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.effectiveBaseUrl).toBe('http://canvas-frontend');
      expect(mockedSeedBoard).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: 'http://canvas-frontend' })
      );
    });
  });

  it('returns 503 when frontend is unreachable', async () => {
    const engine = createMockEngine({ frontendReachable: false });

    await withServer(engine, async baseUrl => {
      const res = await fetch(`${baseUrl}/api/control/seed-board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(503);
      expect(mockedSeedBoard).not.toHaveBeenCalled();
    });
  });

  it('SEED-03: returns 409 when seed already in progress', async () => {
    const engine = createMockEngine();
    mockedSeedBoard.mockImplementation(
      () =>
        new Promise(resolve => {
          setTimeout(
            () =>
              resolve({
                boardId: 'board-1',
                boardName: 'loadgen-large',
                existingCount: 0,
                createdCount: 1300,
                finalCount: 1300,
                skipped: false,
                durationMs: 1000
              }),
            100
          );
        })
    );

    await withServer(engine, async baseUrl => {
      const first = fetch(`${baseUrl}/api/control/seed-board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(isSeedInProgress()).toBe(true);

      const second = await fetch(`${baseUrl}/api/control/seed-board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(second.status).toBe(409);
      await first;
    });
  });
});
