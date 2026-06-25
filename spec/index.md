# Spec Index

Last updated: 2026-06-18

## Architecture Decision Records

- [ADR-001: Local Whiteboard Modular Monolith](adr/ADR-001-local-whiteboard-modular-monolith.md) — Status: Decided
- [ADR-002: Canvas Synthetic Load Generator](adr/ADR-002-canvas-synthetic-load-generator.md) — Status: Accepted (browser-first)
- [ADR-004: In-App Canvas Lag Simulation](adr/ADR-004-canvas-lag-simulation.md) — Status: Proposed
- [ADR-005: Coralogix RUM Demo Scenarios](adr/ADR-005-coralogix-rum-demo-scenarios.md) — Status: Proposed
- [ADR-010: Canvas RUM Journey Event Catalog](adr/ADR-010-canvas-rum-journey-event-catalog.md) — Status: Proposed
- [ADR-011: RUM organization_name Label](adr/ADR-011-rum-organization-name-label.md) — Status: Proposed
- [ADR-012: Board Shape Load RUM Timing](adr/ADR-012-board-shape-load-rum-timing.md) — Status: Proposed
- [ADR-013: CMS Frontend RUM Span Export](adr/ADR-013-cms-frontend-rum-span-export.md) — Status: Accepted
- [ADR-014: RUM Soft Navigation Tracking](adr/ADR-014-rum-soft-navigation-tracking.md) — Status: Proposed
- [ADR-015: Canvas Blank Render Layout Fix](adr/ADR-015-canvas-blank-render-layout-fix.md) — Status: Proposed
- [ADR-016: Coralogix OTEL Helm Migration](adr/ADR-016-coralogix-otel-helm-migration.md) — Status: Proposed
- [ADR-006: Synthetic RUM User Context for Load Testing](adr/ADR-006-rum-synthetic-user-context-load-testing.md) — Status: Proposed
- [ADR-007: Loadgen Session Pacing for Long RUM Replays](adr/ADR-007-loadgen-long-rum-sessions.md) — Status: Proposed
- [ADR-008: Standard RUM Session Labels for Load Testing](adr/ADR-008-rum-standard-session-labels.md) — Status: Proposed
- [ADR-009: Seed Board via Canvas-Load Admin UI](adr/ADR-009-canvas-load-seed-board-admin.md) — Status: Proposed

## Architecture

- [Collaborative Whiteboard Overview](architecture/whiteboard-overview.md)
- [Canvas Load Testing](architecture/canvas-load-testing.md)
- [Canvas Coralogix RUM Demo](architecture/canvas-rum-demo.md)
- [Coralogix OTEL Helm Migration](architecture/coralogix-otel-helm-migration.md)

## Component Contracts

- [Whiteboard API](components/whiteboard-api.md)
- [Whiteboard Canvas](components/whiteboard-canvas.md)
- [Canvas Render Layout](components/canvas-render-layout.md)
- [CMS Picture Extension](components/cms-picture-extension.md)
- [Canvas Load Generator (protocol)](components/canvas-load-generator.md) — deprecated for v1
- [Canvas Load Generator (browser)](components/canvas-load-generator-browser.md) — **canonical v1**
- [Canvas Lag Simulator](components/canvas-lag-simulator.md)
- [Canvas RUM Demo Scenarios](components/canvas-rum-demo-scenarios.md)
- [Canvas RUM Loadgen Extension](components/canvas-rum-loadgen-extension.md)
- [Canvas Load Session Pacing](components/canvas-load-session-pacing.md)
- [Canvas RUM Synthetic User Context](components/canvas-rum-user-context.md)
- [Canvas RUM Session Labels](components/canvas-rum-session-labels.md)
- [Canvas RUM Journey Events](components/canvas-rum-journey-events.md)
- [Board Shape Load Timing](components/board-shape-load-timing.md)
- [Canvas-Load Seed Board](components/canvas-load-seed-board.md)
- [RUM Organization Label](components/rum-organization-label.md)
- [CMS Frontend RUM Tracing](components/cms-frontend-rum-tracing.md)
- [RUM Soft Navigation Tracking](components/rum-soft-navigation.md)
- [Canvas Backend OpenTelemetry](components/canvas-backend-otel.md)
