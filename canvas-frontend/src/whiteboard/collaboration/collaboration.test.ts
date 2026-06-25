import { useWhiteboardStore } from '../store/whiteboardStore';
import { UserIdentity } from '../types/models';

test('remote selection state is keyed by collaborator identity', () => {
  const user: UserIdentity = { userId: 'remote-user', displayName: 'Bold Otter', color: '#3b82f6' };
  useWhiteboardStore.getState().setRemoteSelection(user, ['shape-a', 'shape-b']);

  expect(useWhiteboardStore.getState().remoteSelections[user.userId]).toEqual({
    user,
    shapeIds: ['shape-a', 'shape-b']
  });
});
