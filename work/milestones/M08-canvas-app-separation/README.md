# M08 Canvas App Separation

## Goal

Split the canvas/whiteboard feature into dedicated `canvas-frontend` and `canvas-backend` applications with separate Docker images and Kubernetes deployments.

## Requirements

- REQ-SPLIT-001: Canvas frontend code lives under `canvas-frontend`.
- REQ-SPLIT-002: Canvas backend code lives under `canvas-backend`.
- REQ-SPLIT-003: CMS frontend/backend folders no longer own canvas runtime code.
- REQ-SPLIT-004: Kubernetes deploys CMS and canvas as separate frontend/backend workloads.
- REQ-SPLIT-005: Canvas keeps current public routes: `/`, `/boards/:id`, `/api/boards`, and `/hubs/board`.
- REQ-SPLIT-006: Canvas picture picker reads CMS media from the CMS backend only.

## Definition Of Done

- CMS backend and frontend build independently.
- Canvas backend and frontend build and test independently.
- Docker builds exist for CMS backend, CMS frontend, canvas backend, and canvas frontend.
- Kubernetes manifests render with separate CMS and canvas workloads.
- Evidence records exact deterministic command output.

## Deterministic Commands

```bash
dotnet restore backend/DemoCms.sln
dotnet build backend/DemoCms.sln --configuration Release --no-restore
dotnet list backend/DemoCms.Api/DemoCms.Api.csproj package --vulnerable --include-transitive
dotnet list backend/DemoCms.MediaWorker/DemoCms.MediaWorker.csproj package --vulnerable --include-transitive
dotnet list canvas-backend/Whiteboard.sln package --vulnerable --include-transitive
dotnet restore canvas-backend/Whiteboard.sln
dotnet test canvas-backend/Whiteboard.sln --configuration Release
npm audit --audit-level=high
npm audit --audit-level=high --prefix automated-tests
npm ci --prefix frontend
npm audit --audit-level=high --prefix frontend
npm run typecheck --prefix frontend
npm test --prefix frontend -- --watchAll=false
npm run build --prefix frontend
PUBLIC_PATH=/cms/ REACT_APP_BASE_PATH=/cms npm run build --prefix frontend
npm ci --prefix canvas-frontend
npm audit --audit-level=high --prefix canvas-frontend
npm run typecheck --prefix canvas-frontend
npm test --prefix canvas-frontend -- --watchAll=false
npm run build --prefix canvas-frontend
npm run e2e --prefix canvas-frontend
docker build -t demo-cms-backend:test -f backend/Dockerfile backend
docker build -t demo-cms-frontend:test -f frontend/Dockerfile frontend
docker build -t demo-cms-media-worker:test -f backend/DemoCms.MediaWorker/Dockerfile backend
docker build -t demo-canvas-backend:test -f canvas-backend/Dockerfile canvas-backend
docker build -t demo-canvas-frontend:test -f canvas-frontend/Dockerfile canvas-frontend
kubectl kustomize k8s
```

## Fixtures

- Canvas backend uses deterministic whiteboard test data and SQLite test stores.
- Canvas Playwright uses committed CMS image fixtures and local test servers.
- Kubernetes render uses local manifests only.

## Status

done

## Evidence

- `dotnet restore backend/DemoCms.sln`: Passed.
- `dotnet build backend/DemoCms.sln --configuration Release --no-restore`: Passed with existing nullable warnings, 0 errors.
- `dotnet list backend/DemoCms.Api/DemoCms.Api.csproj package --vulnerable --include-transitive`: Passed, no vulnerable packages.
- `dotnet list backend/DemoCms.MediaWorker/DemoCms.MediaWorker.csproj package --vulnerable --include-transitive`: Passed, no vulnerable packages.
- `dotnet list canvas-backend/Whiteboard.sln package --vulnerable --include-transitive`: Passed, no vulnerable packages.
- `dotnet restore canvas-backend/Whiteboard.sln`: Passed.
- `dotnet test canvas-backend/Whiteboard.sln --configuration Release`: Passed, 9 tests.
- `npm audit --audit-level=high`: Passed, no vulnerabilities.
- `npm audit --audit-level=high --prefix automated-tests`: Passed, no vulnerabilities.
- `npm ci --prefix frontend`: Passed with remaining moderate dev-server audit warnings.
- `npm audit --audit-level=high --prefix frontend`: Passed; remaining audit findings are moderate dev-server transitive packages.
- `npm run typecheck --prefix frontend`: Passed.
- `npm test --prefix frontend -- --watchAll=false`: Passed, 3 suites and 14 tests.
- `npm run build --prefix frontend`: Passed with webpack asset-size warnings.
- `PUBLIC_PATH=/cms/ REACT_APP_BASE_PATH=/cms npm run build --prefix frontend`: Passed and emitted `/cms/runtime-env.js`.
- `npm ci --prefix canvas-frontend`: Passed with remaining moderate dev-server audit warnings.
- `npm audit --audit-level=high --prefix canvas-frontend`: Passed; remaining audit findings are moderate dev-server transitive packages.
- `npm run typecheck --prefix canvas-frontend`: Passed.
- `npm test --prefix canvas-frontend -- --watchAll=false`: Passed, 9 suites and 23 tests.
- `npm run build --prefix canvas-frontend`: Passed with webpack asset-size warnings.
- `npm run e2e --prefix canvas-frontend`: Passed, 2 Playwright tests.
- `docker build -t demo-cms-backend:test -f backend/Dockerfile backend`: Passed with existing nullable warnings.
- `docker build -t demo-cms-frontend:test -f frontend/Dockerfile frontend`: Passed with npm engine/moderate audit and webpack asset-size warnings.
- `docker build -t demo-cms-media-worker:test -f backend/DemoCms.MediaWorker/Dockerfile backend`: Passed.
- `docker build -t demo-canvas-backend:test -f canvas-backend/Dockerfile canvas-backend`: Passed.
- `docker build -t demo-canvas-frontend:test -f canvas-frontend/Dockerfile canvas-frontend`: Passed with npm moderate audit and webpack asset-size warnings.
- `docker run --rm --add-host cms-backend:127.0.0.1 demo-cms-frontend:test /bin/sh -c "... nginx -t"`: Passed.
- `docker run --rm --add-host canvas-backend:127.0.0.1 --add-host cms-backend:127.0.0.1 demo-canvas-frontend:test /bin/sh -c "... nginx -t"`: Passed.
- `kubectl kustomize k8s`: Passed.
