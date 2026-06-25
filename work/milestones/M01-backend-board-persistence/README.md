# M01 Backend Board Persistence

## Goal

Persist boards and shapes in SQLite and expose board REST APIs.

## Requirements

- REQ-BE-001: Demo Board is seeded when database is empty.
- REQ-BE-002: Board CRUD works through `/api/boards`.
- REQ-BE-003: Shapes cascade delete with boards.
- REQ-BE-004: Shape enum values are stored as strings.

## Definition Of Done

- EF Core model and migration exist.
- REST endpoints pass unit/integration tests against temp SQLite.

## Deterministic Commands

```bash
cd backend && dotnet build Whiteboard.sln -warnaserror
cd backend && dotnet test Whiteboard.sln --configuration Release --filter Category=BoardApi
```

## Fixtures

- Temp SQLite database per test.
- Fixed Demo Board assertions.

## Status

done

## Evidence

- `DOTNET_ROLL_FORWARD=Major dotnet build Whiteboard.sln -warnaserror`: Build succeeded, 0 warnings, 0 errors.
- `DOTNET_ROLL_FORWARD=Major dotnet test Whiteboard.sln --configuration Release`: Passed, 10 tests including board CRUD, seed, cascade delete, enum-string mapping, image shape persistence, and seeded media facade.
