# M03 Frontend Board List And Canvas Core

## Goal

Implement board list, canvas scene store, drawing tools, pan, zoom, selection, move, resize, delete, and inline text editing.

## Requirements

- REQ-FE-001: `/` lists, creates, renames, and deletes boards.
- REQ-FE-002: `/boards/:id` renders one Canvas 2D element.
- REQ-FE-003: Rectangle, ellipse, line, text, and sticky tools create shapes.
- REQ-FE-004: Pan and zoom remain within limits.
- REQ-FE-005: Select, move, resize, delete, and inline text edit work locally.

## Definition Of Done

- Jest/RTL tests cover store, board list, canvas math, and interaction dispatch.
- TypeScript strict build passes.

## Deterministic Commands

```bash
cd frontend && npm run typecheck
cd frontend && npm test -- --watchAll=false --testPathPattern=whiteboard
cd frontend && npm run build
```

## Fixtures

- Mock board API responses.
- Fixed canvas dimensions and pointer events.

## Status

done

## Evidence

- `npm run typecheck`: Passed.
- `npm test -- --watchAll=false`: 7 suites passed, 11 tests.
- `npm run build`: Webpack compiled successfully.
