# M05 CMS Picture Placement

## Goal

Query existing CMS media, filter images, and place selected pictures as synchronized `Image` shapes.

## Requirements

- REQ-IMG-001: Media picker queries `GET /api/media` or tag filter endpoint.
- REQ-IMG-002: Non-image content types are excluded.
- REQ-IMG-003: Selected picture creates an `Image` shape with `mediaId`, `imageUrl`, and `altText`.
- REQ-IMG-004: Image shapes persist and reload with boards.
- REQ-IMG-005: Image shapes sync through SignalR like other shapes.

## Definition Of Done

- Unit tests cover filtering and image shape payloads.
- E2E fixture image can be placed and reloaded.

## Deterministic Commands

```bash
cd backend && dotnet test Whiteboard.sln --configuration Release --filter Category=ImageShapes
cd frontend && npm test -- --watchAll=false --testPathPattern=image
```

## Fixtures

- `frontend/tests/fixtures/cms-images.ts`
- Tiny deterministic image files served by test fixture server or mocked route.

## Status

done

## Evidence

- `DOTNET_ROLL_FORWARD=Major dotnet test Whiteboard.sln --configuration Release --filter Category=ImageShapes`: Passed, 2 tests.
- `DOTNET_ROLL_FORWARD=Major dotnet test Whiteboard.sln --configuration Release`: Passed, 10 tests including image shape persistence and seeded media facade.
- `npm test -- --watchAll=false --testPathPattern=image`: Passed, 1 test.
- `npm test -- --watchAll=false`: 7 suites passed, 11 tests including CMS image filtering.
