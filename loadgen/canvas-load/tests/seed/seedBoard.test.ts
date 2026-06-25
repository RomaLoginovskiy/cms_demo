import { seedBoard } from '../../src/seed/seedBoard';

jest.mock('@microsoft/signalr', () => {
  const invoke = jest.fn().mockResolvedValue(undefined);
  const connection = {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    invoke
  };
  return {
    HubConnectionBuilder: jest.fn().mockImplementation(() => ({
      withUrl: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue(connection)
    }))
  };
});

describe('seedBoard', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('SEED-01: skips when existing count is at or above target', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'board-1', name: 'loadgen-large' }]
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'board-1', name: 'loadgen-large', shapes: new Array(1400).fill({}) })
      } as Response);

    const result = await seedBoard({
      baseUrl: 'http://localhost',
      boardName: 'loadgen-large',
      targetCount: 1300
    });

    expect(result.skipped).toBe(true);
    expect(result.createdCount).toBe(0);
    expect(result.finalCount).toBe(1400);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('creates missing shapes via SignalR batches', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'board-1', name: 'loadgen-large' }]
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'board-1', name: 'loadgen-large', shapes: new Array(100).fill({}) })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'board-1', name: 'loadgen-large', shapes: new Array(1300).fill({}) })
      } as Response);

    const onProgress = jest.fn();
    const result = await seedBoard({
      baseUrl: 'http://localhost',
      boardName: 'loadgen-large',
      targetCount: 1300,
      batchSize: 25,
      onProgress
    });

    expect(result.skipped).toBe(false);
    expect(result.existingCount).toBe(100);
    expect(result.createdCount).toBe(1200);
    expect(result.finalCount).toBe(1300);
    expect(onProgress).toHaveBeenCalled();
  });
});
