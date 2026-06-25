import { create } from 'zustand';
import { randomId } from '../../util/randomId';
import { Shape, Tool, UserIdentity, Viewport } from '../types/models';

interface RemoteSelection {
  user: UserIdentity;
  shapeIds: string[];
}

interface WhiteboardState {
  boardId: string | null;
  boardName: string;
  shapes: Shape[];
  selectedShapeIds: string[];
  tool: Tool;
  viewport: Viewport;
  presence: UserIdentity[];
  cursors: Record<string, { user: UserIdentity; x: number; y: number }>;
  remoteSelections: Record<string, RemoteSelection>;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  setBoard: (boardId: string, boardName: string, shapes: Shape[]) => void;
  setTool: (tool: Tool) => void;
  setViewport: (viewport: Viewport) => void;
  selectShapes: (shapeIds: string[]) => void;
  upsertShape: (shape: Shape) => void;
  removeShape: (shapeId: string) => void;
  setPresence: (users: UserIdentity[]) => void;
  addPresence: (user: UserIdentity) => void;
  removePresence: (userId: string) => void;
  setCursor: (user: UserIdentity, x: number, y: number) => void;
  setRemoteSelection: (user: UserIdentity, shapeIds: string[]) => void;
  setConnectionStatus: (status: WhiteboardState['connectionStatus']) => void;
  resetBoard: () => void;
  beginBoardLoad: (boardId: string) => void;
}

export const useWhiteboardStore = create<WhiteboardState>((set) => ({
  boardId: null,
  boardName: '',
  shapes: [],
  selectedShapeIds: [],
  tool: 'Select',
  viewport: { offsetX: 0, offsetY: 0, zoom: 1 },
  presence: [],
  cursors: {},
  remoteSelections: {},
  connectionStatus: 'disconnected',

  setBoard: (boardId, boardName, shapes) => set({ boardId, boardName, shapes, selectedShapeIds: [] }),
  resetBoard: () => set({
    boardId: null,
    boardName: '',
    shapes: [],
    selectedShapeIds: [],
    tool: 'Select',
    viewport: { offsetX: 0, offsetY: 0, zoom: 1 },
    presence: [],
    cursors: {},
    remoteSelections: {},
    connectionStatus: 'disconnected'
  }),
  beginBoardLoad: (boardId) => set({
    boardId,
    boardName: '',
    shapes: [],
    selectedShapeIds: [],
    connectionStatus: 'connecting',
    presence: [],
    cursors: {},
    remoteSelections: {}
  }),
  setTool: (tool) => set({ tool }),
  setViewport: (viewport) => set({ viewport }),
  selectShapes: (shapeIds) => set({ selectedShapeIds: shapeIds }),
  upsertShape: (shape) => set((state) => ({
    shapes: state.shapes.some(item => item.id === shape.id)
      ? state.shapes.map(item => (item.id === shape.id ? shape : item))
      : [...state.shapes, shape]
  })),
  removeShape: (shapeId) => set((state) => ({
    shapes: state.shapes.filter(shape => shape.id !== shapeId),
    selectedShapeIds: state.selectedShapeIds.filter(id => id !== shapeId)
  })),
  setPresence: (users) => set({ presence: users }),
  addPresence: (user) => set((state) => ({
    presence: state.presence.some(item => item.userId === user.userId) ? state.presence : [...state.presence, user]
  })),
  removePresence: (userId) => set((state) => ({
    presence: state.presence.filter(user => user.userId !== userId),
    cursors: Object.fromEntries(Object.entries(state.cursors).filter(([id]) => id !== userId)),
    remoteSelections: Object.fromEntries(Object.entries(state.remoteSelections).filter(([id]) => id !== userId))
  })),
  setCursor: (user, x, y) => set((state) => ({ cursors: { ...state.cursors, [user.userId]: { user, x, y } } })),
  setRemoteSelection: (user, shapeIds) => set((state) => ({
    remoteSelections: { ...state.remoteSelections, [user.userId]: { user, shapeIds } }
  })),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus })
}));

export function createShapeDraft(boardId: string, type: Shape['type'], base: Partial<Shape>): Shape {
  const now = new Date().toISOString();
  return {
    id: randomId(),
    boardId,
    type,
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    endX: null,
    endY: null,
    fill: type === 'Sticky' ? '#fde68a' : '#60a5fa',
    stroke: '#1f2937',
    strokeWidth: 2,
    text: type === 'Text' ? 'Text' : type === 'Sticky' ? 'Sticky note' : null,
    fontSize: type === 'Text' || type === 'Sticky' ? 18 : null,
    zIndex: 1,
    mediaId: null,
    imageUrl: null,
    altText: null,
    templateId: null,
    geometryJson: null,
    rotationX: type === 'Mesh3D' ? 0 : null,
    rotationY: type === 'Mesh3D' ? 0 : null,
    updatedAt: now,
    ...base
  };
}
