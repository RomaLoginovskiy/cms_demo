# Complex shape templates

Templates are bundled in `catalog.ts` as normalized geometry:

- **Path** (`kind: "path"`): `segments` with coordinates in `[0,1]×[0,1]` relative to the shape bbox.
- **Mesh3D** (`kind: "mesh3d"`): `vertices` in `[-0.5,0.5]³`, `faces` as triangle index triples.

## Limits

- Server rejects `geometryJson` larger than **2 MB** on create.
- `grid-stress` (~164 segments) and `dense-cube` (~432 triangles) are stress fixtures; avoid many per board in production.

## Adding templates

1. Add geometry to `catalog.ts` or generate with `scripts/build-mesh-template.mjs` from OBJ (future).
2. Register in `pathTemplateCatalog` or `mesh3DTemplateCatalog`.
