# ADR-016: Migrate Coralogix OTEL from k8s-raw to Helm

**Status**: Proposed  
**Date**: 2026-06-18

## Context

The repo currently ships plain Kubernetes manifests under `coralogix/k8s-raw/` that replaced the official `coralogix/otel-integration` Helm chart (`otel-coralogix-integration` release). The raw path was scoped to **Infrastructure Explorer only** (cluster metrics, resource catalog, K8s events) and deliberately dropped app logs, traces, spanmetrics, profiles, eBPF profiler, and Kafka log export.

Application telemetry depends on capabilities the raw stack excludes:

| Consumer | Export path | Requires |
|---|---|---|
| CMS/canvas/media-worker backends | `OpenTelemetry__OtlpEndpoint=http://$(NODE):4318` (`status.hostIP`) | Agent DaemonSet **hostPort 4318** on every node |
| Browser RUM traces (ADR-013) | Ingress `/v1/traces` → `k8s/otel-gateway:4318` | Separate gateway Deployment + `coralogix-keys` |
| Agent container logs | Kafka topic `otel-logs` | Kafka in `cms-demo`, gateway log pipeline |

Helm configuration in `coralogix/values.yaml` re-enables the full integration: agent presets (logs, spanmetrics, profiles), cluster collector, eBPF profiler, Kafka log export, `opentelemetry-gateway` subchart, and `demoCmsMediaWorker`.

Docker Desktop requires `coralogix/post-renderer.sh` to rewrite `mountPropagation: HostToContainer` → `None` for agent/collector hostPath mounts.

## Evaluation Criteria

- **Observability** — restore traces, logs, spanmetrics, profiles, and infra catalog in one supported path
- **Maintainability** — reduce forked OTEL YAML drift (`k8s-raw/config/*` vs chart templates)
- **Deployability** — single `helm upgrade` with versioned chart; post-renderer for local clusters
- **Fault-tolerance** — explicit failure when Kafka or `coralogix-keys` missing (no silent discard)
- **Constraints** — keep ADR-013 browser trace ingress via `k8s/otel-gateway`; keep `http://$(NODE):4318` for backends

### Options scorecard (1 = worst, 5 = best)

| Characteristic | A: Stay k8s-raw | B: Helm full (`values.yaml`) | C: Hybrid (Helm + raw patches) |
|---|---|---|---|
| Observability | 2 | 5 | 4 |
| Maintainability | 2 | 5 | 2 |
| Deployability | 3 | 4 | 2 |
| Testability | 3 | 4 | 2 |
| **Total** | **10** | **18** | **10** |

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| **A: Stay on k8s-raw** | Minimal cluster RBAC; no Helm dependency | No app traces/logs/spanmetrics; duplicates chart maintenance |
| **B: Helm via `coralogix/values.yaml`** | Supported chart; full telemetry; rollback documented in raw README | Chart upgrade discipline; Docker Desktop post-renderer; resource name collisions during cutover |
| **C: Hybrid** | Cherry-pick infra-only raw config | Two sources of truth; highest drift risk |

## Decision

**Adopt Option B**: remove `coralogix/k8s-raw/` from the deploy path and install:

```bash
helm repo add coralogix https://cgx.jfrog.io/artifactory/coralogix-charts-virtual
helm upgrade --install otel-coralogix-integration coralogix/otel-integration \
  -n cms-demo -f coralogix/values.yaml \
  --post-renderer coralogix/post-renderer.sh
```

**Keep separate app-layer gateway** (`k8s/otel-gateway-*.yaml`, `k8s/ingress.yaml` `/v1/traces`) for browser OTLP/JSON per ADR-013. Disable or minimally configure Helm `opentelemetry-gateway` so it does not conflict with the ingress-facing `otel-gateway` Service name or duplicate RUM trace routing.

**Keep `k8s/otel-agent-service.yaml`** — its selector (`app.kubernetes.io/instance: otel-coralogix-integration`) matches Helm labels, not raw labels (`coralogix-otel-raw`). It is the canonical ClusterIP for in-cluster OTLP after migration; backends continue to use hostIP + hostPort.

### Cross-cutting enforcement layers (OTLP to backends)

| Layer | Enforcement | Misconfiguration symptom |
|---|---|---|
| Agent DaemonSet | hostPort 4318 (must be verified in rendered Helm manifest) | Backends log export errors; empty APM for server spans |
| Pod env | `OpenTelemetry__OtlpEndpoint=http://$(NODE):4318` in `k8s/*-deployment.yaml` | Apps send to wrong host if hostPort absent |
| Service `otel-agent` | Selects Helm agent pods (`k8s/otel-agent-service.yaml`) | Empty endpoints if Helm not installed or wrong release name |
| NetworkPolicy | `k8s/network-policy.yaml` allows pod-to-pod + ingress-nginx | OTLP blocked only if policy tightened without hostPort path |

### Kafka log pipeline layers

| Layer | Role |
|---|---|
| Agent (`values.yaml` `exporters.kafka/logs`) | Publishes container logs to `kafka:9092` topic `otel-logs` |
| `k8s/kafka-deployment.yaml` | Broker prerequisite in `cms-demo` |
| `k8s/otel-gateway-config.yaml` | Consumes `otel-logs`, exports to Coralogix |
| Helm agent logs pipeline | Must stay aligned with gateway consumer topic/encoding (`otlp_json`) |

## Implications

- **Positive**: Single chart for agent, cluster collector, eBPF profiler, spanmetrics, profiles; chart-managed upgrades; `k8s/otel-agent-service.yaml` becomes consistent with running agent.
- **Negative / Risks**: Brief telemetry gap during cutover; ClusterRole/Deployment name overlap between raw and Helm; Docker Desktop hostPath still needs post-renderer; Kafka must be up before agent log pipeline starts.
- **Follow-up actions**:
  1. Execute migration sequence in [coralogix-otel-helm-migration.md](../architecture/coralogix-otel-helm-migration.md)
  2. Confirm agent hostPort 4318 in `helm template` output; add `opentelemetry-agent.ports` overrides to `values.yaml` if absent
  3. Set `opentelemetry-gateway.enabled: false` (or equivalent) if Helm creates conflicting gateway resources
  4. Add `otel-gateway-*.yaml` to `k8s/kustomization.yaml` (currently missing)
  5. Delete `coralogix/k8s-raw/` after green verification
  6. Update root `README.md`, `k8s/README.md`, and component OTEL docs

## Consultation

Repo state review: `coralogix/k8s-raw/`, `coralogix/values.yaml`, `k8s/otel-agent-service.yaml`, `k8s/otel-gateway-*`, ADR-013, `spec/components/canvas-backend-otel.md`.
