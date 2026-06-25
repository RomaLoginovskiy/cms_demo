# M07 Frontend RUM

## Goal

Initialize Coralogix Browser RUM for the Canvas/whiteboard frontend with runtime configuration and low-cardinality custom measurements.

## Requirements

- REQ-RUM-001: Frontend initializes `@coralogix/browser` once when runtime RUM config includes a key.
- REQ-RUM-002: Local and test runs remain deterministic when runtime RUM config is absent.
- REQ-RUM-003: Kubernetes frontend deployment uses the existing Coralogix key and domain env source.
- REQ-RUM-004: Canvas, board API, and SignalR events emit low-cardinality custom measurements without raw IDs, URLs, file names, or pointer coordinates.

## Definition Of Done

- Unit tests cover RUM config parsing, disabled mode, one-time initialization, and measurement label scrubbing.
- Frontend typecheck, unit tests, production build, Docker build, Playwright acceptance, and manifest render pass.

## Deterministic Commands

```bash
cd frontend && npm run typecheck
cd frontend && npm test -- --watchAll=false
cd frontend && npm run build
docker build -t cms-demo-frontend-rum-check -f frontend/Dockerfile frontend
docker run --rm --entrypoint /bin/sh -e BACKEND_HOST=127.0.0.1:8080 -e CMS_HOST=127.0.0.1:8080 cms-demo-frontend-rum-check -c "/docker-runtime-env.sh && envsubst '\${BACKEND_HOST} \${CMS_HOST}' < /etc/nginx/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -t"
kubectl kustomize k8s
cd frontend && npx playwright test --project=chromium
```

## Fixtures

- Jest mocks `@coralogix/browser`.
- Runtime RUM config is injected through `runtime-env.js`.
- Playwright uses seeded Demo Board fixtures from the M06 acceptance slice.

## Status

done

## Evidence

- `npm run typecheck`: Passed.
- `npm test -- --watchAll=false`: 9 suites passed, 23 tests passed.
- `npm run build`: Passed with webpack asset-size warnings after SDK inclusion.
- `docker build -t cms-demo-frontend-rum-check -f frontend/Dockerfile frontend`: Passed with npm audit warnings from existing dependency tree.
- Runtime config smoke test for `cms-demo-frontend-rum-check`: Passed with JSON-escaped env values and `nginx -t`.
- `kubectl kustomize k8s`: Passed.
- `npx playwright test --project=chromium`: 2 passed.
