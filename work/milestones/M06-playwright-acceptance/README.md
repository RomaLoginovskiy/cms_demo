# M06 Playwright Acceptance

## Goal

Verify end-to-end acceptance criteria in Chromium with deterministic fixtures.

## Requirements

- REQ-E2E-001: `/` shows Demo Board.
- REQ-E2E-002: Board create, rename, delete work.
- REQ-E2E-003: Tools create, move, resize, delete, and edit text.
- REQ-E2E-004: Two tabs see edits, cursors, selections, identities, and image placement within 200ms.
- REQ-E2E-005: Closing/reopening and backend restart preserve shapes.

## Definition Of Done

- Playwright suite passes locally.
- Failure artifacts include screenshot, video, and trace.

## Deterministic Commands

```bash
cd frontend && npx playwright test --project=chromium
```

## Fixtures

- Test database reset before run.
- Fixed image metadata route.
- Two isolated browser contexts.

## Status

done

## Evidence

- `npx playwright test --project=chromium`: 2 passed.
- `docker build -f frontend/Dockerfile frontend`: Passed.
- `docker build -t cms-demo-backend-check -f backend/Dockerfile backend`: Passed for `Whiteboard.Api`.
- `docker run` smoke test for `cms-demo-backend-check` hit `/healthz`, `/ready`, `/api/boards`, and `/api/media`: Passed.
