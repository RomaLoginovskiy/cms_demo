# M09 — Canvas load generator (browser-first)

## Goal

Always-on Playwright load service against **canvas-frontend** with admin UI, configurable profiles, and stress/chaos modes.

## Status

done

## Evidence (2026-05-28)

```text
npm ci --prefix loadgen/canvas-load
npm run typecheck --prefix loadgen/canvas-load
npm test --prefix loadgen/canvas-load -- --watchAll=false --runInBand
  Tests: 27 passed (10 suites)

npm run build --prefix loadgen/canvas-load
node loadgen/canvas-load/dist/index.js --dry-run --config loadgen/canvas-load/config/smoke.yaml
  exit 0
```

Added `complex_placer` profile (M10): places Path/Mesh3D templates via **Complex shapes** picker.

## Spec

- [canvas-load-generator-browser.md](../../../spec/components/canvas-load-generator-browser.md)
- [ADR-002](../../../spec/adr/ADR-002-canvas-synthetic-load-generator.md)

## Kubernetes networking

| Browser (your laptop) | Playwright (canvas-load pod) |
|-------------------------|------------------------------|
| http://localhost/ (ingress) | http://canvas-frontend |

Env `CANVAS_LOAD__Target__FrontendBaseUrl=http://canvas-frontend` is set in [k8s/canvas-load-deployment.yaml](../../../k8s/canvas-load-deployment.yaml).

## Gate commands (must exit 0)

```bash
npm ci --prefix loadgen/canvas-load
npm run typecheck --prefix loadgen/canvas-load
npm test --prefix loadgen/canvas-load -- --watchAll=false
npm run build --prefix loadgen/canvas-load
node loadgen/canvas-load/dist/index.js --dry-run --config loadgen/canvas-load/config/smoke.yaml
```

### Cluster smoke

```bash
kubectl exec -n cms-demo deploy/canvas-load -- wget -qO- http://canvas-frontend
kubectl port-forward svc/canvas-load 8090:8080 -n cms-demo
# UI: Frontend ok, Resume, errorRate < 0.05
```

## Fitness functions

| ID | Criterion |
|----|-----------|
| LF-01 | Smoke 5 users, 60s, errorRate < 0.05 |
| LF-02 | Cross-tab shape sync < 500ms |
| LF-03 | Cleanup removes `loadgen*` boards |
| LF-04 | Chaos 5m, backend pod restart = 0 |
| LF-05 | Pause → activeContexts 0 within 30s |
| LF-06 | Ramp 5→15 users within ramp_up + 5s |
