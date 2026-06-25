# CMS Picture Extension

## Scope

The whiteboard can query CMS pictures and place them on the canvas. This is the only image feature added to the base whiteboard spec.

Out of scope remains:

- Uploading media from the whiteboard.
- Editing CMS metadata from the whiteboard.
- Copying image files into the whiteboard database.
- Export, templates, auth, or permissions.

## Source API

Use the existing CMS media API:

- `GET /api/media`
- `GET /api/media/filter?tags=a,b`
- `GET /api/media/{id}/file`

The frontend treats media as pictures when `contentType` starts with `image/`.

The canvas app reads these routes from the CMS backend. Canvas backend does not expose a media facade, because CMS remains the single owner for media metadata and file bytes.

## Shape Extension

`Shape.Type` includes `Image`.

Image shapes require:

- `mediaId`
- `imageUrl`
- `altText`
- `x`
- `y`
- `width`
- `height`
- `zIndex`

Image shapes use the same create, update, delete, selection, move, resize, persistence, and SignalR behavior as other shape types.

## Configuration

Frontend:

```env
REACT_APP_CMS_API_URL=http://localhost:8080
```

When omitted, the frontend uses same-origin `/api/media` routes, which Kubernetes routes to the CMS backend.
