# M10 — Complex 2D paths and 3D meshes

## Goal

Prebuilt **Path** (dense 2D segments) and **Mesh3D** (polygon meshes with synced orbit) shapes via template catalog and geometry snapshot persistence.

## Requirements

- REQ-M10-001: `Path` and `Mesh3D` shape types with `templateId`, `geometryJson`, `rotationX`, `rotationY`
- REQ-M10-002: Geometry snapshot on create; hub update preserves geometry when `geometryJson` is null
- REQ-M10-003: ComplexShapePicker with 2D and 3D tabs
- REQ-M10-004: Mesh3D orbit drag syncs rotation to collaborators

## Definition of Done

```bash
cd canvas-backend && dotnet test
cd canvas-frontend && npm test -- --watchAll=false
cd canvas-frontend && npx playwright test tests/e2e/whiteboard.spec.ts
```

All commands exit 0.

## Status

done

## Evidence (2026-05-28)

```text
cd canvas-backend && dotnet test
  Passed: 12

cd canvas-frontend && npm test -- --watchAll=false
  Tests: 51 passed

CI=true npx playwright test tests/e2e/whiteboard.spec.ts
  4 passed
```
