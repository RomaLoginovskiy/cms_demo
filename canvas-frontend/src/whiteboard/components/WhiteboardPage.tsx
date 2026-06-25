import { useEffect, useMemo, useRef, useState } from 'react';
import { whiteboardApi } from '../api/whiteboardApi';
import { BoardHubClient, throttle } from '../collaboration/boardHubClient';
import { cmsMediaApi } from '../media/cmsMediaApi';
import { getOrCreateIdentity, saveDisplayName } from '../store/identity';
import { createShapeDraft, useWhiteboardStore } from '../store/whiteboardStore';
import { CmsMedia, Tool, UserIdentity } from '../types/models';
import { ShapeTemplate } from '../templates/types';
import { CanvasSurface } from './CanvasSurface';
import { ComplexShapePicker } from './ComplexShapePicker';
import { MediaPicker } from './MediaPicker';
import { commitShapeCreate, commitShapeUpdate } from '../collaboration/whiteboardCommit';
import { measurementService } from '../../services/measurements';
import { clearBoardLoadContext, createBoardLoadContext } from '../../observability/rumJourney/journeyContext';
import {
  abandonBoardShapeLoadTiming,
  startBoardShapeLoadTiming
} from '../../observability/rumJourney/boardShapeLoadTiming';
import {
  emitBoardLoadFailed,
  emitBoardLoadFullyInteractive,
  emitBoardLoadStarted
} from '../../observability/rumJourney/journeyEvents';
import { isScenarioActiveFlag } from '../../observability/rumScenarios/scenarioFlags';
import { getRumSessionConfig, rumSetUserContext } from '../../observability/coralogixRum';
import { shouldApplyRumUserContext } from '../../observability/rumUserContext';
import { setWidgetCount, setBoardIdHash, setCollaborativeSession } from '../../observability/rumLabelContext';
import { emitStableError } from '../../observability/rumScenarios/helpers';
import { CRITICAL_BOARD_ERROR } from '../../observability/rumScenarios/types';

interface WhiteboardPageProps {
  boardId: string;
  onBack: () => void;
}

const TOOLS: Tool[] = ['Select', 'Rectangle', 'Ellipse', 'Line', 'Text', 'Sticky'];

export function WhiteboardPage({ boardId, onBack }: WhiteboardPageProps): JSX.Element {
  const store = useWhiteboardStore();
  const [identity, setIdentity] = useState<UserIdentity>(() => getOrCreateIdentity());
  const identityRef = useRef(identity);

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  const hubRef = useRef<BoardHubClient | null>(null);
  if (!hubRef.current) {
    hubRef.current = new BoardHubClient({
      onShapeCreated: (shape) => useWhiteboardStore.getState().upsertShape(shape),
      onShapeUpdated: (shape) => useWhiteboardStore.getState().upsertShape(shape),
      onShapeDeleted: (shapeId) => useWhiteboardStore.getState().removeShape(shapeId),
      onCursorMoved: (userId, x, y) => {
        const current = useWhiteboardStore.getState();
        const user = current.presence.find(item => item.userId === userId);
        if (user && user.userId !== identityRef.current.userId) {
          current.setCursor(user, x, y);
        }
      },
      onSelectionChanged: (userId, shapeIds) => {
        const current = useWhiteboardStore.getState();
        const user = current.presence.find(item => item.userId === userId);
        if (user && user.userId !== identityRef.current.userId) {
          current.setRemoteSelection(user, shapeIds);
        }
      },
      onPresenceSnapshot: (users) => useWhiteboardStore.getState().setPresence(users),
      onPresenceJoined: (user) => useWhiteboardStore.getState().addPresence(user),
      onPresenceLeft: (userId) => useWhiteboardStore.getState().removePresence(userId),
      onStatusChanged: (status) => useWhiteboardStore.getState().setConnectionStatus(status)
    });
  }
  const hub = hubRef.current;

  const throttledCursor = useMemo(() => throttle((x: number, y: number) => {
    void hub.moveCursor(boardId, x, y);
  }, 33), [boardId, hub]);

  useEffect(() => {
    let disposed = false;

    const { boardLoadId } = createBoardLoadContext();

    async function load(): Promise<void> {
      emitBoardLoadStarted(boardLoadId);
      startBoardShapeLoadTiming(boardLoadId);
      useWhiteboardStore.getState().beginBoardLoad(boardId);
      const abandonLoad = isScenarioActiveFlag('s02_abandon_load');
      const session = getRumSessionConfig();
      let phase: 'api' | 'hub' = 'api';

      try {
        const board = await whiteboardApi.getBoard(boardId);
        if (disposed) {
          return;
        }

        useWhiteboardStore.getState().setBoard(board.id, board.name, board.shapes);
        setWidgetCount(board.shapes.length, true);
        setBoardIdHash(board.id);

        if (abandonLoad) {
          abandonBoardShapeLoadTiming(boardLoadId);
          return;
        }

        phase = 'hub';
        await hub.connect(board.id, identity);
        if (disposed) {
          return;
        }

        emitBoardLoadFullyInteractive(boardLoadId, board.shapes.length);

        if (session.scenarioId === 's01') {
          emitStableError(CRITICAL_BOARD_ERROR, 'critical', { feature_area: 'board' });
        }
      } catch (error) {
        abandonBoardShapeLoadTiming(boardLoadId);
        emitBoardLoadFailed(boardLoadId, phase, error);
        useWhiteboardStore.getState().setConnectionStatus('error');
      }
    }

    void load();
    return () => {
      disposed = true;
      abandonBoardShapeLoadTiming(boardLoadId);
      clearBoardLoadContext(boardLoadId);
      void hub.disconnect();
    };
  }, [boardId, hub, identity]);

  useEffect(() => {
    setWidgetCount(store.shapes.length);
  }, [store.shapes.length]);

  useEffect(() => {
    setCollaborativeSession(store.presence.length >= 2);
  }, [store.presence.length]);

  function renameSelf(): void {
    const nextName = window.prompt('Display name', identity.displayName);
    if (!nextName) {
      return;
    }

    const updated = saveDisplayName(nextName);
    setIdentity(updated);

    if (!shouldApplyRumUserContext(getRumSessionConfig())) {
      rumSetUserContext({
        user_id: updated.userId,
        user_name: updated.displayName,
        user_metadata: { source: 'whiteboard' }
      });
    }
  }

  async function placeImage(media: CmsMedia): Promise<void> {
    if (!store.boardId) {
      return;
    }

    const shape = createShapeDraft(store.boardId, 'Image', {
      x: 120,
      y: 120,
      width: 240,
      height: 160,
      fill: '#ffffff',
      mediaId: media.id,
      imageUrl: cmsMediaApi.fileUrl(media.id),
      altText: media.title || media.fileName,
      zIndex: store.shapes.length + 1
    });
    await commitShapeCreate(
      () => hub.createShape(shape),
      () => {
        store.upsertShape(shape);
        measurementService.sendCustomMeasurement('whiteboard_image_placed', 1, {
          media_content_type: media.contentType,
          shape_type: shape.type
        });
      },
      () => store.removeShape(shape.id),
      { operation: 'place_image', shape_type: shape.type, hub_method: 'CreateShape' }
    );
  }

  async function placeTemplate(template: ShapeTemplate): Promise<void> {
    if (!store.boardId) {
      return;
    }

    const shapeType = template.kind === 'path' ? 'Path' : 'Mesh3D';
    const shape = createShapeDraft(store.boardId, shapeType, {
      x: 140,
      y: 140,
      width: template.defaultWidth,
      height: template.defaultHeight,
      fill: shapeType === 'Path' ? '#ffffff' : '#93c5fd',
      stroke: '#1f2937',
      templateId: template.id,
      geometryJson: JSON.stringify(template.geometry),
      rotationX: shapeType === 'Mesh3D' ? 0 : null,
      rotationY: shapeType === 'Mesh3D' ? 0 : null,
      zIndex: store.shapes.length + 1
    });
    await commitShapeCreate(
      () => hub.createShape(shape),
      () => {
        store.upsertShape(shape);
        measurementService.sendCustomMeasurement('whiteboard_complex_shape_placed', 1, {
          shape_type: shape.type,
          template_id: template.id
        });
      },
      () => store.removeShape(shape.id),
      { operation: 'place_template', shape_type: shape.type, hub_method: 'CreateShape' }
    );
  }

  const selected = store.shapes.find(shape => store.selectedShapeIds.length === 1 && shape.id === store.selectedShapeIds[0]);
  const visiblePresence = store.presence.slice(0, 5);

  return (
    <main className="editor-shell">
      <header className="topbar">
        <button type="button" onClick={onBack}>Back</button>
        <h1>{store.boardName || 'Board'}</h1>
        <span data-testid="shape-count">{store.shapes.length} shapes</span>
        {(() => {
          const mesh = store.shapes
            .filter(shape => shape.type === 'Mesh3D')
            .sort((a, b) => b.zIndex - a.zIndex)[0];
          return mesh ? (
            <span data-testid="mesh3d-sync-state" className="sr-only">
              {(mesh.rotationX ?? 0).toFixed(3)},{(mesh.rotationY ?? 0).toFixed(3)}
            </span>
          ) : null;
        })()}
        <span data-testid="connection-status" className={`status ${store.connectionStatus}`}>{store.connectionStatus}</span>
        <div className="avatars" aria-label="Presence">
          {visiblePresence.map(user => <span key={user.userId} style={{ background: user.color }} title={user.displayName}>{user.displayName.slice(0, 1)}</span>)}
          {store.presence.length > 5 && <span>+{store.presence.length - 5}</span>}
        </div>
        <button type="button" onClick={renameSelf}>You: {identity.displayName}</button>
      </header>

      <aside className="toolbar" aria-label="Tools">
        {store.connectionStatus !== 'connected' && (
          <p className="toolbar-hint" data-testid="toolbar-connect-hint">
            {store.connectionStatus === 'error' ? 'Connection failed — refresh the page.' : 'Connecting… drawing unlocks when live.'}
          </p>
        )}
        {TOOLS.map(tool => (
          <button
            key={tool}
            className={store.tool === tool ? 'active' : ''}
            type="button"
            disabled={tool !== 'Select' && store.connectionStatus !== 'connected'}
            onClick={() => store.setTool(tool)}
          >
            {tool}
          </button>
        ))}
        <MediaPicker onPlaceImage={(media) => void placeImage(media)} />
        <ComplexShapePicker onPlaceTemplate={(template) => void placeTemplate(template)} />
      </aside>

      <CanvasSurface
        onCreateShape={(shape) => hub.createShape(shape)}
        onUpdateShape={(shape) => hub.updateShape(shape)}
        onDeleteShape={(shapeId) => hub.deleteShape(boardId, shapeId)}
        onMoveCursor={(x, y) => throttledCursor(x, y)}
        onSelectionChanged={(shapeIds) => void hub.setSelection(boardId, shapeIds)}
      />

      <aside className="properties">
        <h2>Properties</h2>
        {selected ? (
          <form>
            <label>
              Fill
              <input
                type="color"
                value={selected.fill}
                onChange={(event) => {
                  const updated = { ...selected, fill: event.currentTarget.value };
                  const snapshot = { ...selected };
                  void commitShapeUpdate(
                    () => hub.updateShape({ ...updated, geometryJson: null }),
                    () => store.upsertShape(updated),
                    () => store.upsertShape(snapshot),
                    { operation: 'edit_fill', shape_type: selected.type, hub_method: 'UpdateShape' }
                  );
                }}
              />
            </label>
            <label>
              Stroke
              <input
                type="color"
                value={selected.stroke}
                onChange={(event) => {
                  const updated = { ...selected, stroke: event.currentTarget.value };
                  const snapshot = { ...selected };
                  void commitShapeUpdate(
                    () => hub.updateShape({ ...updated, geometryJson: null }),
                    () => store.upsertShape(updated),
                    () => store.upsertShape(snapshot),
                    { operation: 'edit_stroke', shape_type: selected.type, hub_method: 'UpdateShape' }
                  );
                }}
              />
            </label>
          </form>
        ) : (
          <p>Select one shape to edit properties.</p>
        )}
        {selected?.type === 'Mesh3D' && (
          <p data-testid="mesh3d-rotation">
            Rotation: {(selected.rotationX ?? 0).toFixed(2)}, {(selected.rotationY ?? 0).toFixed(2)}
          </p>
        )}
      </aside>
    </main>
  );
}
