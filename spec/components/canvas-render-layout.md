# Canvas Render Layout (Component Contract)

## Purpose

Define how the whiteboard canvas element acquires layout size, repaints, and layers 2D vs Mesh3D output. Prevents the "shapes in store, blank canvas" failure mode documented in [ADR-015](../adr/ADR-015-canvas-blank-render-layout-fix.md).

## Ownership

| Module | Responsibility |
|---|---|
| `styles.css` (`.editor-shell`, `.canvas-wrap`) | Grid cell placement and definite block-size for canvas host |
| `CanvasSurface.tsx` | Observe layout changes; orchestrate 2D + Mesh3D repaint |
| `renderers.ts` | Size backing store from **layout dimensions passed in**, not from DOM read alone |
| `mesh3dLayer.ts` | Transparent WebGL overlay; never intercept pointer events |

## Layout contract

### Grid placement (`.editor-shell`)

| Element | `grid-column` | `grid-row` | Notes |
|---|---|---|---|
| `.topbar` | `1 / 4` | `1` | spans all columns |
| `.toolbar` | `1` | `2` | `min-height: 0` |
| `.canvas-wrap` | `2` | `2` | `min-height: 0; min-width: 0; height: 100%` |
| `.properties` | `3` | `2` | `min-height: 0` |

Row 2 height: `minmax(0, calc(100vh - 56px))`.

### Canvas host (`.canvas-wrap`)

- `position: relative` — positioning context for text editor, rubber band, Mesh3D overlay.
- Must have **non-zero** `getBoundingClientRect()` before any paint that commits shape pixels.
- 2D `<canvas>` fills host via `width/height: 100%`.

## Repaint triggers

Repaint **must** run when any of:

1. Shape list, selection, viewport, cursors, or remote selections change (existing deps).
2. **Layout size of `.canvas-wrap` changes** (`ResizeObserver` → `renderTick`).
3. Image load callback requests redraw (existing `onImageLoad`).

Repaint **must not** commit shape pixels when `wrap.getBoundingClientRect()` width or height is `0` (defer to next observer tick).

## Render pipeline (single rAF)

```
ResizeObserver / state change
  → requestAnimationFrame
    → rect = wrap.getBoundingClientRect()
    → if rect zero: return
    → renderScene(canvas, …, rect.width, rect.height)
    → meshLayer.render(shapes, viewport, rect.width, rect.height)
    → onBoardShapePaintFrame({ hasLayout: true, shapeCount })
```

**Single source of truth for layout**: `wrap.getBoundingClientRect()` in `CanvasSurface`; do not re-read canvas rect inside `renderScene`.

## Layer stacking

| Layer | z-index | pointer-events |
|---|---|---|
| 2D canvas (`data-testid="whiteboard-canvas"`) | 0 | auto (interaction target) |
| Rubber band | 1 | none |
| Text editor | 2 | auto |
| Mesh3D overlay (`.mesh3d-overlay`) | 1 | none |

Mesh3D overlay must use `background: transparent` in CSS.

## Shape type routing

| Type | 2D canvas | Mesh3D overlay |
|---|---|---|
| Rectangle, Ellipse, Line, Sticky, Text, Image, Path | yes | no |
| Mesh3D | no | yes |

Blank 2D canvas with non-zero 2D shapes in store indicates a **layout/repaint bug**, not missing draw logic.

## Error modes

| Condition | Expected behavior |
|---|---|
| Layout `0×0` at paint time | Skip paint; wait for ResizeObserver |
| Layout non-zero, shapes > 0 | Visible pixels within world bounds |
| Mesh3D `geometryJson` invalid | Skip mesh; 2D shapes still visible |
| All shapes Mesh3D, valid geometry | Visible on overlay only |

## Fitness functions

1. **Layout-before-paint**: With mocked `800×600` wrap rect, first paint after `setBoard` produces canvas backing store ≥ `800 × dpr`.
2. **Resize repaint**: Changing wrap size triggers second paint without viewport change (unit test with fake ResizeObserver).
3. **E2E smoke**: Demo Board opens with canvas `width > 1 && height > 1` in DOM (Playwright).
