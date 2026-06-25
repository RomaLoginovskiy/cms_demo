# Whiteboard API Contract

## REST

Base path: `/api`

- `GET /api/boards` returns `[{ id, name, updatedAt }]`.
- `POST /api/boards` with `{ name }` creates a board and returns `{ id, name }`.
- `GET /api/boards/{id}` returns `{ id, name, shapes: ShapeDto[] }`.
- `PATCH /api/boards/{id}` with `{ name }` renames a board.
- `DELETE /api/boards/{id}` deletes the board and cascades shapes.

## Shape DTO

```json
{
  "id": "guid",
  "boardId": "guid",
  "type": "Rectangle|Ellipse|Sticky|Text|Line|Image|Path|Mesh3D",
  "x": 0,
  "y": 0,
  "width": 100,
  "height": 80,
  "endX": null,
  "endY": null,
  "fill": "#ffffff",
  "stroke": "#111827",
  "strokeWidth": 2,
  "text": null,
  "fontSize": null,
  "zIndex": 1,
  "mediaId": null,
  "imageUrl": null,
  "altText": null,
  "templateId": null,
  "geometryJson": null,
  "rotationX": null,
  "rotationY": null,
  "updatedAt": "2026-05-25T00:00:00+00:00"
}
```

Server ignores client `updatedAt` and stamps receipt time.

### Complex geometry fields

| Field | Used by | Notes |
|-------|---------|-------|
| `templateId` | `Path`, `Mesh3D` | Catalog provenance (max 64 chars) |
| `geometryJson` | `Path`, `Mesh3D` | Snapshot at create; required non-empty on `CreateShape` |
| `rotationX`, `rotationY` | `Mesh3D` | Orbit angles in radians; default 0 |

On `UpdateShape`, when `geometryJson` is `null`, the server preserves the stored geometry. Clients send `geometryJson: null` for move, resize, and orbit-only updates.

## SignalR Hub

Route: `/hubs/board`

Client-to-server methods:

- `JoinBoard(Guid boardId, Guid userId, string displayName, string color)`
- `LeaveBoard(Guid boardId)`
- `CreateShape(Guid boardId, ShapeDto shape)`
- `UpdateShape(Guid boardId, ShapeDto shape)`
- `DeleteShape(Guid boardId, Guid shapeId)`
- `MoveCursor(Guid boardId, double x, double y)`
- `SetSelection(Guid boardId, Guid[] shapeIds)`

Server-to-client events:

- `ShapeCreated(ShapeDto)`
- `ShapeUpdated(ShapeDto)`
- `ShapeDeleted(Guid shapeId)`
- `CursorMoved(Guid userId, double x, double y)`
- `SelectionChanged(Guid userId, Guid[] shapeIds)`
- `PresenceJoined(UserDto)`
- `PresenceLeft(Guid userId)`
- `PresenceSnapshot(UserDto[])`

## Server Rules

- Persist create/update/delete shape operations before broadcasting.
- Sender receives its own broadcast.
- Cursor and selection events are broadcast only and never persisted.
- Presence is keyed by SignalR connection id.
- Disconnect broadcasts `PresenceLeft` to every board group joined by that connection.
- Conflict resolution is last-write-wins per shape.
