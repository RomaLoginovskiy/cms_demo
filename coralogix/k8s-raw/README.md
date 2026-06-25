# Coralogix OTel Collectors (raw Kubernetes manifests)

> **Deprecated — do not deploy to cluster.** This directory is kept for reference only.
> The active deployment uses the Helm chart `otel-coralogix-integration` with [`coralogix/values.yaml`](../values.yaml).
> Install: `helm upgrade --install otel-coralogix-integration coralogix/otel-integration -n cms-demo -f coralogix/values.yaml --post-renderer coralogix/post-renderer.sh`

Plain k8s manifests replacing the Helm chart `otel-coralogix-integration` for **Infrastructure Explorer** telemetry only.

## Scope

**Included**
- Resource catalog entities (`coralogix/resource_catalog` exporter)
- K8s cluster metrics (`k8s_cluster`, API server, cAdvisor, kubeletstats, hostmetrics)
- K8s events
- Host entity events (agent `logs/resource_catalog` pipeline)

**Excluded** (dropped vs Helm)
- App container logs (`filelog`)
- Traces, spanmetrics, profiles
- eBPF profiler
- Kafka log export

## Prerequisites

- Namespace `cms-demo` exists
- Secret `coralogix-keys` with key `PRIVATE_KEY` in `cms-demo`
- `kubectl` context pointing at target cluster

## Deploy

```bash
# 1. Remove Helm release (required — same resource names)
helm uninstall otel-coralogix-integration -n cms-demo

# Also remove eBPF profiler if still present (not in raw manifests)
kubectl -n cms-demo delete daemonset coralogix-ebpf-profiler --ignore-not-found

# 2. Apply raw manifests
kubectl apply -k coralogix/k8s-raw/

# 3. Wait for rollout
kubectl -n cms-demo rollout status deploy/coralogix-opentelemetry-collector
kubectl -n cms-demo rollout status ds/coralogix-opentelemetry-agent
```

## Verify

```bash
# Pods running
kubectl -n cms-demo get pods -l app.kubernetes.io/part-of=coralogix-infrastructure-explorer

# Config valid (local)
docker run --rm -v "$PWD/coralogix/k8s-raw/config:/cfg:ro" \
  ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib:0.142.0 \
  validate --config=/cfg/collector-relay.yaml

docker run --rm -v "$PWD/coralogix/k8s-raw/config:/cfg:ro" \
  ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib:0.142.0 \
  validate --config=/cfg/agent-relay.yaml

# Collector logs — no auth/RBAC errors
kubectl -n cms-demo logs deploy/coralogix-opentelemetry-collector --tail=50

# Agent logs
kubectl -n cms-demo logs ds/coralogix-opentelemetry-agent --tail=50
```

In Coralogix UI: Infrastructure Explorer should show cluster `cms-demo-cluster` with nodes, pods, namespaces within ~2–5 minutes.

## Rollback

```bash
kubectl delete -k coralogix/k8s-raw/
helm upgrade --install otel-coralogix-integration coralogix/otel-integration \
  -n cms-demo -f coralogix/values.yaml \
  --post-renderer coralogix/post-renderer.sh
```

## Configuration

| Setting | Value |
|---------|-------|
| Domain | `eu1.coralogix.com` |
| Cluster name | `cms-demo-cluster` |
| Collector image | `otelcol-contrib:0.142.0` |
| Integration label | `coralogix-integration-k8s-raw` |

Relay configs live in `config/collector-relay.yaml` and `config/agent-relay.yaml`; embedded into ConfigMaps `04-*` and `05-*`.

## File layout

| File | Resource |
|------|----------|
| `01-serviceaccounts.yaml` | ServiceAccounts |
| `02-rbac-collector.yaml` | ClusterRole + Binding (collector) |
| `03-rbac-agent.yaml` | ClusterRole + Binding (agent) |
| `04-configmap-collector.yaml` | Cluster collector config |
| `05-configmap-agent.yaml` | Node agent config |
| `06-deployment-collector.yaml` | Cluster collector Deployment |
| `07-daemonset-agent.yaml` | Node agent DaemonSet |
| `08-services.yaml` | `coralogix-opentelemetry-collector`, `otel-agent` Services |
