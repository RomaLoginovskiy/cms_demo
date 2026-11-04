# Spec Index

Last updated: 2026-11-02

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
- [ADR-017: AWS EKS Platform with Terraform, Argo CD and floci](adr/ADR-017-aws-eks-gitops-platform.md) — Status: Proposed
- [ADR-018: Edge Routing on EKS with Gateway API (Envoy Gateway)](adr/ADR-018-eks-edge-routing-gateway-api.md) — Status: Proposed
- [ADR-019: Workload Identity via IRSA in All Environments](adr/ADR-019-workload-identity-irsa.md) — Status: Proposed
- [ADR-020: Mapping State and Messaging onto AWS Services (Phased)](adr/ADR-020-aws-data-services-mapping.md) — Status: Proposed
- [ADR-021: CMS Media Q&A Agent via Tool Calling over the CMS API](adr/ADR-021-cms-media-qa-agent.md) — Status: Proposed
- [ADR-022: Self-Hosted LLM Serving with vLLM (CPU Locally, GPU on EKS)](adr/ADR-022-vllm-model-serving.md) — Status: Proposed
- [ADR-023: Incident Detection and Investigation Demo and Workshop on cms-demo](adr/ADR-023-incident-workshop.md) — Status: Proposed (v1: live demo on a local Mac; v2: hands-on lab)
- [ADR-024: Investigation-Grade Telemetry, Change Events and Detection as Code](adr/ADR-024-investigation-telemetry.md) — Status: Proposed
- [ADR-025: Coralogix Annotations for CI/CD, Argo CD and Infrastructure Changes](adr/ADR-025-coralogix-annotations.md) — Status: Proposed (amends ADR-024 decision 4)
- [ADR-026: OpenTelemetry Web SDK in the CMS Frontend](adr/ADR-026-cms-frontend-otel-web-sdk.md) — Status: Proposed (extends ADR-013)
- [ADR-006: Synthetic RUM User Context for Load Testing](adr/ADR-006-rum-synthetic-user-context-load-testing.md) — Status: Proposed
- [ADR-007: Loadgen Session Pacing for Long RUM Replays](adr/ADR-007-loadgen-long-rum-sessions.md) — Status: Proposed
- [ADR-008: Standard RUM Session Labels for Load Testing](adr/ADR-008-rum-standard-session-labels.md) — Status: Proposed
- [ADR-009: Seed Board via Canvas-Load Admin UI](adr/ADR-009-canvas-load-seed-board-admin.md) — Status: Proposed

## Architecture

- [Collaborative Whiteboard Overview](architecture/whiteboard-overview.md)
- [Canvas Load Testing](architecture/canvas-load-testing.md)
- [Canvas Coralogix RUM Demo](architecture/canvas-rum-demo.md)
- [Coralogix OTEL Helm Migration](architecture/coralogix-otel-helm-migration.md)
- [AWS EKS Platform Architecture](architecture/aws-eks-platform.md)
- [AWS EKS Delivery Plan](architecture/aws-eks-delivery-plan.md)
- [Incident Detection and Investigation Demo (v1) and Workshop (v2)](architecture/incident-workshop.md) — demo flow (Slack → Olly → Coralogix UI, Claude Code side by side), delivery plan
- [Incident Demo: Scope for the First Customer Run (2026-11-03)](architecture/incident-demo-scope-2026-11-03.md) — tomorrow's cut: Postgres-lite INC-1, auto scale-out commit, P1 APM alert to #production-alerts, Claude Code side by side

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
- [Terraform Infrastructure](components/terraform-infrastructure.md)
- [GitOps with Argo CD](components/gitops-argocd.md)
- [floci Local AWS Environment](components/floci-local-environment.md)
- [cms-demo Workload Contract on EKS](components/cms-demo-workload-contract.md)
- [Coralogix Annotations (ops-events)](components/coralogix-annotations.md) — builds, CI, Argo CD syncs and Terraform applies on charts
- [CMS Media Agent](components/cms-media-agent.md)
- [vLLM Model Serving](components/vllm-serving.md)
- [Demo and Lab Platform](components/workshop-lab-platform.md) — demo profile on floci, workshop baseline, injection, fix and reset; `lab` (v2)
- [Incident Scenarios](components/workshop-scenarios.md) — demo beats (INC-1, INC-4, INC-0) and the INC-0…INC-8 catalog with answer keys
- [Workshop Telemetry and Detection](components/workshop-telemetry-detection.md) — signals, emulated AWS, change events (with ADR-025), Slack/Olly, alerts, SLOs, dashboards
- [Investigation Method, Demo Script, Skills and Facilitation](components/workshop-investigation-playbooks.md) — run of show, Olly and Claude Code scripts
