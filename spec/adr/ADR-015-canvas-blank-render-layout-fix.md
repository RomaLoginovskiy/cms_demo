# ADR-015: Canvas Blank Render — Layout and Repaint Contract

**Status**: Proposed  
**Date**: 2026-06-01

## Context

Observed bug in `canvas-frontend`: board header shows correct shape count (e.g. "4 shapes"), hub is connected, API returns shapes with valid coordinates, but the canvas area appears blank.

Investigation covered:

1. Store → render pipeline (`CanvasSurface.tsx` render `useEffect`, `renderers.ts`)
2. Canvas sizing / missing `ResizeObserver`
3. CSS grid placement for `.canvas-wrap` inside `.editor-shell`
4. `Mesh3DLayer` WebGL overlay stacking
5. Viewport defaults and shape type mapping

**Confirmed not broken**: Zustand store population (`setBoard`, hub echo), API enum serialization (`"Rectangle"` PascalCase), default viewport `{ offsetX: 0, offsetY: 0, zoom: 1 }`, 2D draw paths for Rectangle/Sticky/Ellipse.

## Evaluation Criteria

| Characteristic | Priority |
|---|---|
| Honest failure | Blank canvas must not occur when store has shapes and layout is non-zero |
| Observability | ADR-012 paint timers already gate on `hasLayout`; fix must align layout signal with actual bitmap size |
| Maintainability | Single repaint trigger; avoid duplicating sizing logic |
| Testability | Unit test for zero-size deferral; optional Playwright pixel/assertion on seeded board |

| Characteristic | A: CSS only | B: ResizeObserver only | C: CSS + ResizeObserver + sizing unification (chosen) |
|---|---|---|---|
| Fixes race on fast API | 2 | 4 | 5 |
| Fixes window resize | 1 | 5 | 5 |
| Grid edge cases | 4 | 2 | 5 |
| Minimal diff | 5 | 4 | 3 |
| **Total** | **12** | **15** | **18** |

## Root Cause Analysis

### Primary — paint before layout + no resize hook (Silent Discard)

`CanvasSurface` repaints only when Zustand deps change (`state.shapes`, `state.viewport`, etc.). There is **no `ResizeObserver`** on `.canvas-wrap`.

`renderScene` sizes the backing store from `canvas.getBoundingClientRect()`:

```26:29:canvas-frontend/src/whiteboard/canvas/renderers.ts
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
```

When the first qualifying rAF runs before the grid cell has a non-zero size, `rect` is `0×0` → backing store becomes **`1×1`** (`Math.max(1, …)`). CSS still stretches the `<canvas>` to the visible area (`height: 100%; width: 100%`), so the user sees an empty gray field — not an obvious layout bug.

If shapes arrive in the same frame as mount (fast local API), the effect may run once at zero layout and **never again** until the user pans/zooms/edits (viewport change). Store count in the header updates; canvas stays blank. This matches the reported symptom exactly.

RUM paint code uses `wrap.getBoundingClientRect()` for `hasLayout`, while `renderScene` uses the **canvas** element — these can diverge briefly when percentage height has not resolved.

### Contributing — implicit grid placement for `.canvas-wrap`

`.editor-shell` defines a 3-column, 2-row grid; only `.topbar` has explicit placement (`grid-column: 1 / 4`). `.canvas-wrap` relies on auto-placement:

```123:128:canvas-frontend/src/styles.css
.editor-shell {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) 260px;
  grid-template-rows: 56px minmax(0, calc(100vh - 56px));
  height: 100vh;
}
```

```201:211:canvas-frontend/src/styles.css
.canvas-wrap {
  min-height: 0;
  position: relative;
}

.canvas-wrap canvas {
  background: #f8fafc;
  display: block;
  height: 100%;
  width: 100%;
}
```

Auto-placement works in the happy path (toolbar → col 1, canvas → col 2, properties → col 3), but `.canvas-wrap` lacks:

- explicit `grid-column: 2; grid-row: 2`
- `min-width: 0` (prevents overflow collapse in `minmax(0, 1fr)` column)
- `height: 100%` ( reinforces definite block-size for percentage-sized canvas child)

These omissions increase the window where the canvas child reports `0×0` during layout.

### Secondary — Mesh3D overlay stacking (not primary for 2D boards)

`Mesh3DLayer.attach` appends a WebGL `<canvas>` **after** the 2D canvas, `position: absolute; inset: 0`, no `z-index`. It calls `renderer.render` every frame even when there are zero `Mesh3D` shapes.

With `alpha: true` and `setClearColor(0, 0)`, the overlay should be transparent, but some compositors treat WebGL canvases as opaque unless CSS `background: transparent` is set. This can mask 2D content on boards that mix 2D and 3D shapes; it does **not** explain missing Rectangle/Ellipse/Sticky on a 2D-only board unless the overlay is fully opaque.

`drawShape` intentionally skips `Mesh3D` on the 2D context — Mesh3D-only boards rely entirely on the overlay.

## Decision

Adopt **Option C**:

1. **CSS** — explicit grid cells for toolbar, canvas, properties; definite sizing on `.canvas-wrap`.
2. **`ResizeObserver`** on `.canvas-wrap` — bump `renderTick` when width/height change.
3. **Sizing unification** — pass wrap dimensions into `renderScene` (single source of truth).
4. **Overlay layering** — CSS z-index + transparent background on `.mesh3d-overlay`; keep `pointer-events: none`.

## Minimal Fix (implementation contract)

### 1. `canvas-frontend/src/styles.css`

```css
.toolbar {
  grid-column: 1;
  grid-row: 2;
  min-height: 0;
}

.canvas-wrap {
  grid-column: 2;
  grid-row: 2;
  min-height: 0;
  min-width: 0;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.properties {
  grid-column: 3;
  grid-row: 2;
  min-height: 0;
}

.canvas-wrap canvas[data-testid="whiteboard-canvas"] {
  position: relative;
  z-index: 0;
}

.mesh3d-overlay {
  background: transparent;
  pointer-events: none;
  z-index: 1;
}
```

### 2. `canvas-frontend/src/whiteboard/components/CanvasSurface.tsx`

Add a layout observer effect:

```tsx
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
```

In the render effect, size from wrap (not canvas) and skip paint when layout is zero:

```tsx
const rect = wrap.getBoundingClientRect();
if (rect.width <= 0 || rect.height <= 0) {
  return;
}

renderScene(canvas, shapes, ..., rect.width, rect.height);
meshLayerRef.current?.render(shapes, state.viewport, rect.width, rect.height);
```

### 3. `canvas-frontend/src/whiteboard/canvas/renderers.ts`

Extend signature:

```tsx
export function renderScene(
  canvas: HTMLCanvasElement,
  shapes: Shape[],
  selectedShapeIds: string[],
  viewport: Viewport,
  remoteSelections: Record<string, { user: UserIdentity; shapeIds: string[] }>,
  cursors: Record<string, { user: UserIdentity; x: number; y: number }>,
  layoutWidth: number,
  layoutHeight: number,
  onImageLoad?: () => void
): void
```

Replace `canvas.getBoundingClientRect()` with `layoutWidth` / `layoutHeight` for buffer sizing and `clearRect`.

### 4. Tests (recommended)

- Unit: `renderScene` with explicit `800×600` layout draws non-blank pixel for a Rectangle fixture (jsdom canvas).
- Optional Playwright: open Demo Board, assert canvas backing store `width/height > 1` via `page.evaluate`.

## Implications

- **Positive**: Eliminates blank-canvas race; window resize repaints; ADR-012 `hasLayout` aligns with bitmap sizing.
- **Negative / Risks**: Extra repaints on panel resize — acceptable; debounce only if profiling shows jank.
- **Follow-up**: Consider `premultipliedAlpha: false` on `WebGLRenderer` if overlay opacity issues persist on Safari.

## Consultation

Code review of `CanvasSurface.tsx`, `renderers.ts`, `styles.css`, `mesh3dLayer.ts`; cross-check with ADR-012 paint hook semantics.
