import { BoardDetail, BoardSummary } from '../types/models';
import { measurementService } from '../../services/measurements';
import { getApiBaseUrl } from './apiBase';
import { rumFetch } from '../../observability/rumFetch';

const API_URL = getApiBaseUrl();

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const whiteboardApi = {
  async listBoards(): Promise<BoardSummary[]> {
    const startTime = performance.now();
    const response = await rumFetch(`${API_URL}/api/boards`);
    measurementService.trackAPIMetrics('/api/boards', 'GET', startTime, performance.now(), undefined, response.status);
    const boards = await readJson<BoardSummary[]>(response);
    measurementService.sendCustomMeasurement('whiteboard_boards_loaded', boards.length, { operation: 'list_boards' });
    return boards;
  },

  async createBoard(name: string): Promise<{ id: string; name: string }> {
    const startTime = performance.now();
    const response = await rumFetch(`${API_URL}/api/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    measurementService.trackAPIMetrics('/api/boards', 'POST', startTime, performance.now(), undefined, response.status);
    const created = await readJson<{ id: string; name: string }>(response);
    measurementService.sendCustomMeasurement('whiteboard_board_created', 1, { operation: 'create_board' });
    return created;
  },

  async getBoard(id: string): Promise<BoardDetail> {
    const startTime = performance.now();
    const response = await rumFetch(`${API_URL}/api/boards/${id}`);
    measurementService.trackAPIMetrics('/api/boards/:id', 'GET', startTime, performance.now(), undefined, response.status);
    const board = await readJson<BoardDetail>(response);
    measurementService.sendCustomMeasurement('whiteboard_shapes_loaded', board.shapes.length, { operation: 'open_board' });
    return board;
  },

  async renameBoard(id: string, name: string): Promise<void> {
    const startTime = performance.now();
    const response = await rumFetch(`${API_URL}/api/boards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    measurementService.trackAPIMetrics('/api/boards/:id', 'PATCH', startTime, performance.now(), undefined, response.status);

    if (!response.ok) {
      throw new Error(`Rename failed: ${response.status}`);
    }
    measurementService.sendCustomMeasurement('whiteboard_board_renamed', 1, { operation: 'rename_board' });
  },

  async deleteBoard(id: string): Promise<void> {
    const startTime = performance.now();
    const response = await rumFetch(`${API_URL}/api/boards/${id}`, { method: 'DELETE' });
    measurementService.trackAPIMetrics('/api/boards/:id', 'DELETE', startTime, performance.now(), undefined, response.status);
    if (!response.ok) {
      throw new Error(`Delete failed: ${response.status}`);
    }
    measurementService.sendCustomMeasurement('whiteboard_board_deleted', 1, { operation: 'delete_board' });
  }
};
