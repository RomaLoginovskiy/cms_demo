import { ensureBoard, getShapeCount } from '../../src/seed/boardApi';

describe('boardApi', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('reuses existing board by name', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'board-1', name: 'loadgen-large' }]
    } as Response);

    const id = await ensureBoard('http://localhost', 'loadgen-large');

    expect(id).toBe('board-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost/api/boards');
  });

  it('creates board when missing', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'other', name: 'other-board' }]
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'new-board' })
      } as Response);

    const id = await ensureBoard('http://localhost/', 'loadgen-large');

    expect(id).toBe('new-board');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'loadgen-large' })
    });
  });

  it('returns shape count from board detail', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'board-1', name: 'loadgen-large', shapes: [{}, {}, {}] })
    } as Response);

    const count = await getShapeCount('http://localhost', 'board-1');

    expect(count).toBe(3);
  });
});
