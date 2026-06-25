import { useWhiteboardStore } from './whiteboardStore';
import { Shape, UserIdentity } from '../types/models';

const user: UserIdentity = { userId: 'user-1', displayName: 'Curious Fox', color: '#ef4444' };

function shape(id = 'shape-1'): Shape {
  return {
    id,
    boardId: 'board-1',
    type: 'Rectangle',
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    endX: null,
    endY: null,
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 2,
    text: null,
    fontSize: null,
    zIndex: 1,
    mediaId: null,
    imageUrl: null,
    altText: null,
    templateId: null,
    geometryJson: null,
    rotationX: null,
    rotationY: null,
    updatedAt: '2026-05-25T00:00:00Z'
  };
}

beforeEach(() => {
  useWhiteboardStore.setState({
    boardId: null,
    boardName: '',
    shapes: [],
    selectedShapeIds: [],
    presence: [],
    cursors: {},
    remoteSelections: {}
  });
});

test('upserts optimistic shapes and reconciles server echo by id', () => {
  useWhiteboardStore.getState().upsertShape(shape());
  useWhiteboardStore.getState().upsertShape({ ...shape(), fill: '#ff0000' });

  expect(useWhiteboardStore.getState().shapes).toHaveLength(1);
  expect(useWhiteboardStore.getState().shapes[0]?.fill).toBe('#ff0000');
});

test('tracks presence cursors and remote selections', () => {
  useWhiteboardStore.getState().addPresence(user);
  useWhiteboardStore.getState().setCursor(user, 12, 24);
  useWhiteboardStore.getState().setRemoteSelection(user, ['shape-1']);

  expect(useWhiteboardStore.getState().presence).toEqual([user]);
  expect(useWhiteboardStore.getState().cursors[user.userId]?.x).toBe(12);
  expect(useWhiteboardStore.getState().remoteSelections[user.userId]?.shapeIds).toEqual(['shape-1']);
});
