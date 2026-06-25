# M02 Backend SignalR Sync

## Goal

Synchronize persisted shape operations and ephemeral collaboration state through SignalR.

## Requirements

- REQ-RT-001: Join sends `PresenceSnapshot` and broadcasts `PresenceJoined`.
- REQ-RT-002: Shape create/update/delete persist before broadcast.
- REQ-RT-003: Sender receives echo.
- REQ-RT-004: Cursor and selection events are not persisted.
- REQ-RT-005: Disconnect broadcasts `PresenceLeft`.

## Definition Of Done

- Hub integration tests run two clients against TestServer.
- Broadcast path meets 200ms acceptance budget in local tests.

## Deterministic Commands

```bash
cd backend && dotnet test Whiteboard.sln --configuration Release --filter Category=Realtime
```

## Fixtures

- Fixed board id and fixed user ids.
- Temp SQLite database per test.

## Status

done

## Evidence

- `DOTNET_ROLL_FORWARD=Major dotnet test Whiteboard.sln --configuration Release --filter Category=Realtime`: Passed, 4 tests.
- `DOTNET_ROLL_FORWARD=Major dotnet test Whiteboard.sln --configuration Release`: Passed, 10 tests including `BoardHubTests`.
