# ADR-003: Complex geometry snapshot and rotation fields

## Status

Accepted

## Context

Path and Mesh3D shapes may contain thousands of segments or triangles. Sending full geometry on every move or orbit would exceed SignalR payload limits and waste bandwidth.

## Decision

1. Persist `geometryJson` as a TEXT snapshot on the shape row at create time.
2. On hub `UpdateShape`, when `geometryJson` is null, preserve the stored geometry.
3. Store Mesh3D orbit as `rotationX` and `rotationY` (radians) on the shape row; update on pointer-up after orbit.

## Consequences

- Template catalog files are only needed for placement; loaded boards are self-contained.
- Clients must send `geometryJson: null` on transform-only updates for large shapes.
- Geometry size capped at 2 MB on create.
