# Whiteboard Canvas Contract

## Scene Graph

The frontend keeps all shapes in a Zustand scene graph keyed by shape id. Rendering always derives from state and writes to one native `<canvas>` element using the HTML5 Canvas 2D API.

## Tools

- Select: `V`
- Rectangle: `R`
- Ellipse: `O`
- Line: `L`
- Text: `T`
- Sticky: `S`
- Image: selected from CMS picture picker
- Complex shapes: **Complex shapes** picker with 2D paths and 3D meshes tabs

Shape tools create one shape on pointer release and then switch back to Select. Path and Mesh3D are placed from the complex-shapes picker (click template → shape at default position).

## Rendering

- Apply device pixel ratio before every redraw.
- Size backing store from **layout dimensions supplied by `CanvasSurface`** (wrap `getBoundingClientRect`), not an independent canvas rect read — see [Canvas Render Layout](canvas-render-layout.md).
- Skip paint when layout width or height is zero; rely on `ResizeObserver` on `.canvas-wrap` to trigger the next frame.
- Sort shapes by `zIndex`.
- Draw remote selections as dashed outlines in the remote user's color.
- Draw remote cursors with a name label in the remote user's color.
- Repaint via `requestAnimationFrame` after state changes **and** after layout size changes.

## Interaction

- Pan with space + drag or middle-mouse drag.
- Zoom with ctrl/cmd + scroll, clamped from 10% to 400%, centered on cursor.
- Select by click, shift-click for multi-select, empty-drag for rubber-band.
- Move selected shapes during drag; send one hub `UpdateShape` per moved shape at drag end.
- Resize with handles; send updates on drag end.
- Delete selected shapes with Delete or Backspace.
- Inline edit Text and Sticky shapes with a positioned `contentEditable` overlay.

## Hit Testing

- Rectangle, ellipse, sticky, text, and image: bounding box.
- Line: distance to segment.
- Path, Mesh3D: bounding box (same as rectangle).
- Handles: fixed screen-size handle boxes transformed to world coordinates.

## Complex shapes

- **Path**: rendered on Canvas2D from cached `Path2D` built from normalized segment list in `geometryJson`.
- **Mesh3D**: rendered on a transparent WebGL layer (Three.js) aligned with canvas pan/zoom; filled polygon mesh from `geometryJson`.
- **Mesh3D orbit**: when exactly one Mesh3D is selected, pointer drag (without space-pan) adjusts `rotationX`/`rotationY`; hub update on pointer-up syncs rotation to peers.
- Hub move/resize sends `geometryJson: null` so large geometry is not re-transmitted.

## Optimistic Sync

- Apply local changes immediately.
- Call hub method.
- Reconcile against the echoed server event.
- Roll back the optimistic change if the hub call fails.
