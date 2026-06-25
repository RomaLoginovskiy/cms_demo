import { CSSProperties, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { hitTest, normalizeBox, screenToWorld, zoomAt } from '../canvas/canvasMath';
import { createDraftAt, resizeDraft } from '../canvas/canvasPointerDraft';
import { renderScene } from '../canvas/renderers';
import { Mesh3DLayer } from '../mesh3d/mesh3dLayer';
import { useWhiteboardStore } from '../store/whiteboardStore';
import { shapeTransformUpdate } from '../store/shapeUpdate';
import { Shape, Point } from '../types/models';
import { getActiveLagSimConfig } from '../../observability/canvasLagSim';
import {
  getActiveBoardLoadContext,
  markFirstWidgetVisibleEmitted
} from '../../observability/rumJourney/journeyContext';
import { onBoardShapePaintFrame } from '../../observability/rumJourney/boardShapeLoadTiming';
import { emitBoardLoadFirstWidgetVisible } from '../../observability/rumJourney/journeyEvents';
import { commitShapeCreate, commitShapeDelete, commitShapeUpdate } from '../collaboration/whiteboardCommit';
import { measurementService } from '../../services/measurements';

interface CanvasSurfaceProps {
  onCreateShape: (shape: Shape) => Promise<void>;
  onUpdateShape: (shape: Shape) => Promise<void>;
  onDeleteShape: (shapeId: string) => Promise<void>;
  onMoveCursor: (x: number, y: number) => void;
  onSelectionChanged: (shapeIds: string[]) => void;
}

type DragState =
  | { mode: 'create'; start: Point }
  | { mode: 'move'; start: Point; originals: Shape[] }
  | { mode: 'resize'; start: Point; original: Shape }
  | { mode: 'orbit'; start: Point; original: Shape; startRotationX: number; startRotationY: number }
  | { mode: 'rubber'; start: Point; end: Point }
  | { mode: 'pan'; start: Point; offsetX: number; offsetY: number }
  | null;

const ORBIT_SENSITIVITY = 0.012;

export function CanvasSurface({ onCreateShape, onUpdateShape, onDeleteShape, onMoveCursor, onSelectionChanged }: CanvasSurfaceProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const meshLayerRef = useRef<Mesh3DLayer | null>(null);
  const dragRef = useRef<DragState>(null);
  const draftRef = useRef<Shape | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [editing, setEditing] = useState<Shape | null>(null);
  const [rubber, setRubber] = useState<{ start: Point; end: Point } | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [spacePressed, setSpacePressed] = useState(false);
  const state = useWhiteboardStore();

  const selectedShapes = useMemo(
    () => state.shapes.filter(shape => state.selectedShapeIds.includes(shape.id)),
    [state.selectedShapeIds, state.shapes]
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }

    const layer = new Mesh3DLayer();
    meshLayerRef.current = layer;
    layer.attach(wrap);
    return () => {
      layer.dispose();
      meshLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }

    const observer = new ResizeObserver(() => {
      setRenderTick(tick => tick + 1);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) {
      return;
    }

    const shapes = draft ? [...state.shapes, draft] : state.shapes;
    let frame = requestAnimationFrame(() => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      renderScene(
        canvas,
        shapes,
        state.selectedShapeIds,
        state.viewport,
        state.remoteSelections,
        state.cursors,
        rect.width,
        rect.height,
        () => setRenderTick(tick => tick + 1)
      );

      meshLayerRef.current?.render(shapes, state.viewport, rect.width, rect.height);

      const paintedShapeCount = state.shapes.length;
      if (state.boardId && rect.width > 0 && rect.height > 0) {
        const loadContext = getActiveBoardLoadContext();
        if (loadContext) {
          onBoardShapePaintFrame({
            boardLoadId: loadContext.boardLoadId,
            shapeCount: paintedShapeCount,
            hasLayout: true
          });

          if (markFirstWidgetVisibleEmitted(loadContext.boardLoadId)) {
            emitBoardLoadFirstWidgetVisible(
              loadContext.boardLoadId,
              shapes.length,
              performance.now() - loadContext.startedAtMs
            );
          }
        }
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [draft, renderTick, state.boardId, state.cursors, state.remoteSelections, state.selectedShapeIds, state.shapes, state.viewport]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isTextInput(event.target)) {
        return;
      }

      if (event.code === 'Space') {
        setSpacePressed(true);
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedShapeIds.length > 0) {
        for (const shapeId of [...state.selectedShapeIds]) {
          const shape = state.shapes.find(item => item.id === shapeId);
          if (shape) {
            measurementService.sendCustomMeasurement('whiteboard_shape_deleted', 1, { shape_type: shape.type });
          }

          void commitShapeDelete(
            () => onDeleteShape(shapeId),
            () => state.removeShape(shapeId),
            () => {
              if (shape) {
                state.upsertShape(shape);
              }
            },
            { operation: 'delete_shape', shape_type: shape?.type ?? 'unknown' }
          );
        }
      }
    }

    function onKeyUp(event: KeyboardEvent): void {
      if (event.code === 'Space') {
        setSpacePressed(false);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onDeleteShape, state]);

  function canvasPoint(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function assignDrag(next: DragState): void {
    dragRef.current = next;
    setDrag(next);
  }

  function assignDraft(next: Shape | null): void {
    draftRef.current = next;
    setDraft(next);
  }

  function releasePointerCapture(event: PointerEvent<HTMLCanvasElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function cancelPointerInteraction(event: PointerEvent<HTMLCanvasElement>): void {
    assignDraft(null);
    setRubber(null);
    assignDrag(null);
    releasePointerCapture(event);
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    const screen = canvasPoint(event);
    const world = screenToWorld(screen, state.viewport);

    if (spacePressed || event.button === 1) {
      assignDrag({ mode: 'pan', start: screen, offsetX: state.viewport.offsetX, offsetY: state.viewport.offsetY });
      return;
    }

    if (state.tool !== 'Select' && state.boardId) {
      if (state.connectionStatus !== 'connected') {
        releasePointerCapture(event);
        return;
      }
      const type = state.tool;
      const nextDrag: DragState = { mode: 'create', start: world };
      const nextDraft = createDraftAt(state.boardId, type, world, state.shapes.length + 1);
      assignDrag(nextDrag);
      assignDraft(nextDraft);
      return;
    }

    const hit = [...state.shapes].reverse().find(shape => hitTest(shape, world));
    if (!hit) {
      setRubber({ start: world, end: world });
      assignDrag({ mode: 'rubber', start: world, end: world });
      return;
    }

    if (state.selectedShapeIds.includes(hit.id) && isResizeHandle(hit, world, state.viewport.zoom)) {
      assignDrag({ mode: 'resize', start: world, original: hit });
      return;
    }

    const nextSelection = event.shiftKey
      ? Array.from(new Set([...state.selectedShapeIds, hit.id]))
      : [hit.id];
    state.selectShapes(nextSelection);
    onSelectionChanged(nextSelection);

    const soleMesh3D = hit.type === 'Mesh3D' && nextSelection.length === 1 && nextSelection[0] === hit.id;
    if (soleMesh3D && !event.shiftKey) {
      assignDrag({
        mode: 'orbit',
        start: world,
        original: hit,
        startRotationX: hit.rotationX ?? 0,
        startRotationY: hit.rotationY ?? 0
      });
      return;
    }

    assignDrag({ mode: 'move', start: world, originals: state.shapes.filter(shape => nextSelection.includes(shape.id)) });
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>): void {
    const screen = canvasPoint(event);
    const world = screenToWorld(screen, state.viewport);
    onMoveCursor(screen.x, screen.y);

    const currentDrag = dragRef.current;
    if (!currentDrag) {
      return;
    }

    if (currentDrag.mode === 'pan') {
      state.setViewport({ ...state.viewport, offsetX: currentDrag.offsetX + screen.x - currentDrag.start.x, offsetY: currentDrag.offsetY + screen.y - currentDrag.start.y });
      return;
    }

    if (currentDrag.mode === 'create') {
      const currentDraft = draftRef.current;
      if (!currentDraft) {
        return;
      }
      assignDraft(resizeDraft(currentDraft, currentDrag.start, world));
      return;
    }

    if (currentDrag.mode === 'orbit') {
      const dx = world.x - currentDrag.start.x;
      const dy = world.y - currentDrag.start.y;
      state.upsertShape({
        ...currentDrag.original,
        rotationX: currentDrag.startRotationX + dy * ORBIT_SENSITIVITY,
        rotationY: currentDrag.startRotationY + dx * ORBIT_SENSITIVITY
      });
      return;
    }

    if (currentDrag.mode === 'move') {
      const dx = world.x - currentDrag.start.x;
      const dy = world.y - currentDrag.start.y;
      for (const original of currentDrag.originals) {
        state.upsertShape({ ...original, x: original.x + dx, y: original.y + dy, endX: original.endX === null ? null : original.endX + dx, endY: original.endY === null ? null : original.endY + dy });
      }
      return;
    }

    if (currentDrag.mode === 'resize') {
      const width = Math.max(8, currentDrag.original.width + world.x - currentDrag.start.x);
      const height = Math.max(8, currentDrag.original.height + world.y - currentDrag.start.y);
      state.upsertShape({ ...currentDrag.original, width, height, endX: currentDrag.original.type === 'Line' ? currentDrag.original.x + width : currentDrag.original.endX, endY: currentDrag.original.type === 'Line' ? currentDrag.original.y + height : currentDrag.original.endY });
      return;
    }

    if (currentDrag.mode === 'rubber') {
      setRubber({ start: currentDrag.start, end: world });
      assignDrag({ ...currentDrag, end: world });
    }
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>): void {
    const currentDrag = dragRef.current;
    const currentDraft = draftRef.current;

    if (currentDrag?.mode === 'create' && currentDraft) {
      const created = currentDraft;
      state.setTool('Select');
      assignDraft(null);
      void commitShapeCreate(
        () => onCreateShape(created),
        () => {
          state.upsertShape(created);
          measurementService.sendCustomMeasurement('whiteboard_shape_created', 1, { shape_type: created.type });
        },
        () => state.removeShape(created.id),
        { operation: 'create_shape', shape_type: created.type, hub_method: 'CreateShape' }
      );
    }

    if (currentDrag?.mode === 'move') {
      measurementService.sendCustomMeasurement('whiteboard_shapes_moved', selectedShapes.length, {
        selected_count: selectedShapes.length.toString()
      });
      for (const shape of selectedShapes) {
        const snapshot = { ...shape };
        void commitShapeUpdate(
          () => onUpdateShape(shapeTransformUpdate(shape, {})),
          () => undefined,
          () => state.upsertShape(snapshot),
          { operation: 'move_shapes', shape_type: shape.type, hub_method: 'UpdateShape' }
        );
      }
    }

    if (currentDrag?.mode === 'orbit') {
      const orbited = useWhiteboardStore.getState().shapes.find(shape => shape.id === currentDrag.original.id);
      if (orbited) {
        const snapshot = { ...orbited };
        void commitShapeUpdate(
          () => onUpdateShape(shapeTransformUpdate(orbited, {
            rotationX: orbited.rotationX,
            rotationY: orbited.rotationY
          })),
          () => undefined,
          () => state.upsertShape(snapshot),
          { operation: 'orbit_shape', shape_type: orbited.type, hub_method: 'UpdateShape' }
        );
      }
    }

    if (currentDrag?.mode === 'resize') {
      const resized = useWhiteboardStore.getState().shapes.find(shape => shape.id === currentDrag.original.id);
      if (resized) {
        const snapshot = { ...resized };
        void commitShapeUpdate(
          () => onUpdateShape(shapeTransformUpdate(resized, {})),
          () => {
            measurementService.sendCustomMeasurement('whiteboard_shape_resized', 1, { shape_type: resized.type });
          },
          () => state.upsertShape(snapshot),
          { operation: 'resize_shape', shape_type: resized.type, hub_method: 'UpdateShape' }
        );
      }
    }

    if (currentDrag?.mode === 'rubber') {
      const box = normalizeBox(currentDrag.start, currentDrag.end);
      const selectedIds = state.shapes
        .filter(shape => boxesIntersect(box, shape))
        .map(shape => shape.id);
      state.selectShapes(selectedIds);
      measurementService.sendCustomMeasurement('whiteboard_shapes_selected', selectedIds.length, {
        selected_count: selectedIds.length.toString()
      });
      onSelectionChanged(selectedIds);
      setRubber(null);
    }

    assignDrag(null);
    releasePointerCapture(event);
  }

  function onPointerCancel(event: PointerEvent<HTMLCanvasElement>): void {
    cancelPointerInteraction(event);
  }

  function onWheel(event: React.WheelEvent<HTMLCanvasElement>): void {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    state.setViewport(zoomAt(state.viewport, canvasPoint(event as unknown as PointerEvent<HTMLCanvasElement>), event.deltaY));
  }

  function onDoubleClick(event: React.MouseEvent<HTMLCanvasElement>): void {
    const screen = canvasPoint(event as unknown as PointerEvent<HTMLCanvasElement>);
    const world = screenToWorld(screen, state.viewport);
    const hit = [...state.shapes].reverse().find(shape => (shape.type === 'Sticky' || shape.type === 'Text') && hitTest(shape, world));
    if (hit) {
      setEditing(hit);
    }
  }

  async function commitText(text: string): Promise<void> {
    if (!editing) {
      return;
    }

    const updated = { ...editing, text };
    const shapeCount = state.shapes.length;
    const lagConfig = getActiveLagSimConfig();
    const lagMode = lagConfig?.mode ?? 'off';

    measurementService.sendCustomMeasurement('whiteboard_board_shape_count', shapeCount);
    measurementService.startTimeMeasurement('whiteboard_text_edit_commit', {
      shape_type: updated.type,
      lag_sim_mode: lagMode
    });

    setEditing(null);

    await commitShapeUpdate(
      () => onUpdateShape(shapeTransformUpdate(updated, { text })),
      () => {
        state.upsertShape(updated);
        measurementService.sendCustomMeasurement('whiteboard_text_committed', 1, { shape_type: updated.type });
      },
      () => state.upsertShape(editing),
      { operation: 'text_edit_commit', shape_type: updated.type, hub_method: 'UpdateShape' }
    );

    measurementService.endTimeMeasurement('whiteboard_text_edit_commit');
  }

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        data-testid="whiteboard-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
      />
      {editing && (
        <textarea
          className="text-editor"
          data-testid="whiteboard-text-editor"
          style={{
            left: editing.x * state.viewport.zoom + state.viewport.offsetX,
            top: editing.y * state.viewport.zoom + state.viewport.offsetY,
            width: editing.width * state.viewport.zoom,
            height: editing.height * state.viewport.zoom
          }}
          defaultValue={editing.text ?? ''}
          autoFocus
          onBlur={(event) => void commitText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              void commitText(event.currentTarget.value);
            }
          }}
        />
      )}
      {rubber && (
        <div
          className="rubber-band"
          style={rubberStyle(rubber.start, rubber.end, state.viewport)}
        />
      )}
    </div>
  );
}

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

function isResizeHandle(shape: Shape, point: Point, zoom: number): boolean {
  const size = 12 / zoom;
  return Math.abs(point.x - (shape.x + shape.width)) <= size && Math.abs(point.y - (shape.y + shape.height)) <= size;
}

function boxesIntersect(box: Pick<Shape, 'x' | 'y' | 'width' | 'height'>, shape: Shape): boolean {
  return box.x <= shape.x + shape.width
    && box.x + box.width >= shape.x
    && box.y <= shape.y + shape.height
    && box.y + box.height >= shape.y;
}

function rubberStyle(start: Point, end: Point, viewport: { offsetX: number; offsetY: number; zoom: number }): CSSProperties {
  const box = normalizeBox(
    { x: start.x * viewport.zoom + viewport.offsetX, y: start.y * viewport.zoom + viewport.offsetY },
    { x: end.x * viewport.zoom + viewport.offsetX, y: end.y * viewport.zoom + viewport.offsetY }
  );

  return {
    left: box.x,
    top: box.y,
    width: box.width,
    height: box.height
  };
}
