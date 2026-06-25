# M08 RUM Demo Scenarios

## Goal

Fourteen reproducible Coralogix RUM demo scenarios (UC1–UC4 + bonus) drivable via URL params, in-app control panel, and loadgen batch replay.

## Requirements

- REQ-RUM-DEMO-001: Session labels (`plan`, `feature_area`, `releaseRing`, `widgetCount`, `rum_scenario`) on every RUM event via `beforeSend`.
- REQ-RUM-DEMO-002: URL params `?rumDemo=1&plan=&v=&scenario=` activate scenarios without rebuild.
- REQ-RUM-DEMO-003: Scenarios S01, S04, S05, S09 produce dashboard-ready signals for detection, impact contrast, and version delta.
- REQ-RUM-DEMO-004: loadgen `rum_batch` preset generates 50+ sessions with per-user plan/version/scenario query strings.

## Definition of Done

- Unit tests pass for observability modules and loadgen `buildRumQuery`.
- `canvas-frontend` production build succeeds.
- `canvas-backend` builds with env-gated RUM demo middleware.

## Deterministic test suite

```bash
cd canvas-frontend && npm test -- --testPathPattern=observability --watchAll=false
cd canvas-frontend && npm run build
cd canvas-backend && dotnet build
cd loadgen/canvas-load && npm test -- --watchAll=false
```

## Status

done (local verification 2026-05-29)
