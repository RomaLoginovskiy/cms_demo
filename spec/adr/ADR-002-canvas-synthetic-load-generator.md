# ADR-002: Canvas Synthetic Load Generator

**Status**: Accepted (browser-first)
**Date**: 2026-05-27
**Supersedes**: Protocol-only Option A in sections below; see [canvas-load-generator-browser.md](../components/canvas-load-generator-browser.md)

## Context

The canvas (whiteboard) stack exposes REST (`/api/boards`) and SignalR (`/hubs/board`) with no authentication. Real-time behavior is exercised today via `BoardHubTests` (in-process `HubConnection` + LongPolling) and Playwright E2E against the browser. There is no k6/Locust harness.

Operators need a **configurable, repeatable** load tool that:

- Simulates multiple concurrent virtual users with distinct behavior profiles.
- Stresses known weak points: SQLite persistence, in-memory presence, hub group fan-out, connection churn.
- Runs locally, in CI (smoke), and as an optional Kubernetes Job against a deployed cluster.

Constraints from the live system (see `BoardHub`, `BoardPresenceStore`, ADR-001):

- Presence is **in-process memory** — multi-replica canvas-backend is out of scope; load tests target a **single** backend pod unless explicitly testing misconfiguration.
- Shape create/update/delete **persist then broadcast**; cursor/selection **broadcast only**.
- Frontend throttles `MoveCursor` to ~33 ms (~30 Hz); load generator should model that as a ceiling, not a floor.
- Ingress exposes `/api/boards`, `/hubs`, and long proxy timeouts (3600s) for WebSockets/long-poll.

## Evaluation Criteria

| Characteristic | Priority | Notes |
|---|---|---|
| **Testability** | High | Deterministic profiles; exit codes; fixture boards |
| **Maintainability** | High | Reuse same hub contracts as `BoardHubTests` / `whiteboard-api.md` |
| **Observability** | High | Structured run summary + Prometheus counters |
| **Deployability** | Medium | Container + K8s Job; no steady-state Deployment required for v1 |
| **Performance** | Medium | Thousands of hub invocations/sec from few pods |
| **Security** | Low | No auth today; generator must not widen attack surface in prod |

### Option scoring (1 = poor, 5 = excellent)

| Characteristic | A: .NET console/worker | B: k6 (JS) | C: Hybrid (.NET SignalR + k6 REST) |
|---|---|---|---|
| SignalR fidelity | 5 | 2 | 4 |
| Maintainability (contract drift) | 5 | 3 | 3 |
| Testability / CI | 5 | 4 | 3 |
| Ops familiarity in repo | 5 | 3 | 3 |
| Pure HTTP board stress | 4 | 5 | 5 |
| **Total** | **24** | **15** | **18** |

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| **A: .NET load worker** (`Microsoft.AspNetCore.SignalR.Client`) | Same stack as `BoardHubTests`; enum JSON parity; easy shared DTO copy/link | Heavier image than k6; not a script DSL |
| **B: k6** | Strong HTTP ramp/stages; Grafana ecosystem | Weak native SignalR; custom extensions or HTTP-only subset |
| **C: Hybrid** | k6 for REST CRUD; .NET for realtime | Two artifacts, two configs, drift risk |
| **D: Node/TS standalone** | Could mirror frontend client | Third runtime; duplicates hub protocol without test factory |

## Decision

Adopt **browser-first Node/Playwright** always-on service (`loadgen/canvas-load`) targeting **canvas-frontend**, with control API + admin UI. Protocol-only .NET hub client (Option A below) is **deferred**.

### v1 (Accepted)

- Node 20 + Playwright + Express
- Always-on K8s Deployment (opt-in overlay)
- See [canvas-load-generator-browser.md](../components/canvas-load-generator-browser.md)

### Deferred (Option A — .NET hub client)

Adopt **Option A: .NET 8 console host** as an optional future boost mode (no separate k6 project).

### Project location and naming

```
loadgen/
  canvas-load/
    CanvasLoad.sln
    CanvasLoad/                 # executable: `canvas-load`
    CanvasLoad.Core/            # profiles, config, metrics, virtual user loop
    CanvasLoad.Tests/           # unit tests for config + profile scheduling (no live hub in default CI)
```

Rationale: sibling to `canvas-backend/` and `canvas-frontend/`, clearly not part of the product surface; `canvas-load` binary name is short for Job commands.

### Protocol and transport

- Target URLs via config: `CANVAS_API_BASE_URL` (default `http://canvas-backend:8080` in cluster).
- SignalR: `HubConnectionBuilder` → `/hubs/board`, **WebSockets preferred**, fallback **LongPolling** (match production ingress).
- JSON: `JsonStringEnumConverter` on hub protocol (same as API).
- Virtual users: one `HubConnection` per user goroutine-equivalent (`Task`), optional shared `HttpClient` for REST.

### Enforcement layers (cross-cutting)

| Concern | Layers | v1 behavior |
|---|---|---|
| **Rate limits** | None on server | Generator self-throttles per profile |
| **Ingress timeout** | nginx 3600s | Chaos mode may force reconnect before timeout |
| **CORS** | canvas-backend | Generator calls API directly (cluster DNS), not via canvas-frontend |
| **SQLite locking** | EF `SaveChanges` per hub write | Stress = many concurrent `CreateShape`/`UpdateShape` |

## Behavior profiles (v1)

Implement as pluggable `IUserProfile` selected by weighted mix in config.

| Profile | REST | SignalR | Intent |
|---|---|---|---|
| **lurker** | Optional `GET /api/boards/{id}` once | `JoinBoard` → idle; rare `MoveCursor` (1–2 Hz) | Presence snapshot size, idle connections |
| **active_drawer** | — | Steady `CreateShape` + `UpdateShape` on random geometry; configurable interval | SQLite write pressure, broadcast volume |
| **collaborator** | — | `MoveCursor` ~30 Hz + `SetSelection` + occasional shape update on **shared** board | Fan-out of ephemeral events (matches UI) |
| **admin** | `POST/PATCH/DELETE /api/boards`, list boards | Light or no hub | Board churn, cascade deletes |
| **chaos** | Invalid names, duplicate deletes | Skip `JoinBoard`, wrong `boardId`, rapid connect/disconnect, invoke after disconnect, concurrent `UpdateShape` on same `shapeId`, burst cursor without throttle | HubException paths, presence leaks, LWW races |

Profile mix example: `lurker:40%, collaborator:35%, active_drawer:20%, admin:5%` with optional `chaos` overlay mode (see component contract).

## Config model

- **Primary**: YAML file mounted as ConfigMap (`/config/load.yaml`).
- **Overrides**: environment variables with prefix `CANVAS_LOAD_` (flatten keys: `CANVAS_LOAD__Users=100`).
- **CLI**: `--config /config/load.yaml --scenario smoke|stress|chaos` for Job args.

See [canvas-load-generator component contract](../components/canvas-load-generator.md) for full knob list.

## Stress and chaos modes (target real failure modes)

| Mode | Knobs | Expected failure signal |
|---|---|---|
| **write_storm** | High `active_drawer` %, low shape interval, 1 board | SQLite busy/timeout, rising hub latency, 503/500 on REST |
| **fanout_storm** | Many users on one board, `collaborator` at 30 Hz cursor | CPU on API pod, SignalR backpressure, client event lag |
| **connection_churn** | Short session TTL, reconnect loop | Presence store growth if disconnect cleanup fails; orphaned groups |
| **board_bloat** | Single board, no delete, max shapes | Large `GET /api/boards/{id}` payload, slow initial load |
| **split_brain_ops** | Two generators updating same `shapeId` | Last-write-wins data loss (documented, not a bug) |
| **protocol_abuse** | `chaos` profile | `HubException`, connection fault; must not crash host process |
| **ingress_soak** | Duration hours, moderate users | nginx/proxy fd exhaustion (cluster-level) |

Generator must **fail loudly**: record hub errors, REST status codes, and abort run if error rate exceeds `abort.error_rate_threshold` (default 0.05 after warmup).

## Deployment

| Environment | Mechanism |
|---|---|
| **Local** | `dotnet run --project loadgen/canvas-load/CanvasLoad` against `localhost:8080` |
| **CI smoke** | Same binary, `scenario: smoke` (10 users, 60s), gate milestone M09 |
| **K8s** | **`Job`** (not Deployment) per run; `parallelism: 1`, `completions: 1`, `backoffLimit: 0` |
| **Scheduled soak** | Optional `CronJob` → Job template (disabled by default in kustomize) |

**Do not** route load through `canvas-frontend` in v1 — measures API/hub only; browser load is Playwright’s domain.

### Observability hooks

- **Process metrics**: Prometheus `/metrics` on port 9091 (OpenTelemetry or `prometheus-net`): `canvas_load_users_active`, `canvas_load_hub_invocations_total{method}`, `canvas_load_hub_errors_total`, `canvas_load_rest_requests_total{route,status}`, `canvas_load_run_phase`.
- **Structured logs**: JSON to stdout (run id, profile, board id, error).
- **End-of-run report**: JSON artifact to `/reports/summary.json` (volume mount); fields: duration, RPS, p50/p95 hub invoke latency, error breakdown.
- **Target scraping**: Reuse existing cluster Prometheus to scrape canvas-backend `/healthz` + future app metrics; correlate generator `run_id` label with test window.

NetworkPolicy: allow Job pod → `canvas-backend:8080` only; deny CMS and frontend.

## Implications

### Positive

- Reuses proven `HubConnection` patterns from `BoardHubTests`.
- Profiles map directly to production hub methods and UI throttle (~33 ms).
- Job-based runs avoid accidental always-on load in shared clusters.

### Negative / risks

- .NET image larger than k6; acceptable for demo repo.
- Single-replica assumption — scaling canvas-backend without sticky sessions will invalidate presence tests (document in runbook).
- Chaos modes can **destroy demo data** — require dedicated board prefix `loadgen-*` and `cleanup: true` default.

### Follow-up actions

1. Implement `loadgen/canvas-load` per component contract.
2. Add `k8s/canvas-load-job.yaml` + ConfigMap example (not applied in default kustomize).
3. Milestone `M09-canvas-load-generator` with deterministic `dotnet test` + smoke Job manifest dry-run.
4. Defer k6 REST-only scripts unless HTTP-only SLO testing is requested separately.

## Consultation

- Grounded in `BoardHub.cs`, `BoardHubTests.cs`, `whiteboard-api.md`, `ingress.yaml`, ADR-001.
