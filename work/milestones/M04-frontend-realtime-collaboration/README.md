# M04 Frontend Realtime Collaboration

## Goal

Wire SignalR client, optimistic reconciliation, remote cursors, remote selections, presence avatars, and identity display.

## Requirements

- REQ-COLLAB-001: Each tab has local `userId`, `displayName`, and `color`.
- REQ-COLLAB-002: Shape operations apply optimistically and reconcile on echo.
- REQ-COLLAB-003: Cursor movement is throttled to 30Hz.
- REQ-COLLAB-004: Remote cursors and selections render in user color.
- REQ-COLLAB-005: Avatar bar shows up to five users plus overflow.

## Definition Of Done

- Jest tests mock hub events and verify state changes.
- Reconnect/error states are visible.

## Deterministic Commands

```bash
cd frontend && npm test -- --watchAll=false --testPathPattern=collaboration
cd frontend && npm run typecheck
```

## Fixtures

- Mock SignalR client.
- Fixed identities and colors.

## Status

done

## Evidence

- `npm test -- --watchAll=false --testPathPattern=collaboration`: Passed, 1 test.
- `npm test -- --watchAll=false --testPathPattern=whiteboardStore`: Passed, 2 tests.
- `npm test -- --watchAll=false`: 7 suites passed, 11 tests.
- `npm run typecheck`: Passed.
