# M00 Specs And Harness

## Goal

Create specs, solution/test scaffolding, and deterministic verification commands.

## Requirements

- REQ-SPEC-001: Whiteboard architecture, API, canvas, and CMS picture extension are documented.
- REQ-TEST-001: Backend, frontend, and Playwright commands are defined.

## Definition Of Done

- Spec files exist under `spec/`.
- Milestone files exist under `work/milestones/`.
- Build and test harnesses can be invoked locally.

## Deterministic Commands

```bash
cd backend && dotnet build Whiteboard.sln -warnaserror
cd backend && dotnet test Whiteboard.sln --configuration Release
cd frontend && npm ci && npm run typecheck && npm test -- --watchAll=false && npm run build
cd frontend && npx playwright test --project=chromium
```

## Fixtures

- `backend/data/whiteboard.db` created from EF migrations and seed initializer.
- `frontend/tests/fixtures/cms-images.ts` for picture picker tests.

## Status

done

## Evidence

- `DOTNET_ROLL_FORWARD=Major dotnet build Whiteboard.sln -warnaserror`: Build succeeded, 0 warnings, 0 errors.
- `DOTNET_ROLL_FORWARD=Major dotnet test Whiteboard.sln --configuration Release`: Passed, 10 tests.
- `npm run typecheck && npm test -- --watchAll=false && npm run build`: TypeScript passed, 7 Jest suites passed, Webpack compiled successfully.
- `npx playwright test --project=chromium`: 2 passed.
