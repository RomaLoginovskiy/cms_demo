# Component: cms-demo Workload Contract on EKS

**Status**: Proposed (2026-10-30)  
**Decisions**: [ADR-018](../adr/ADR-018-eks-edge-routing-gateway-api.md), [ADR-019](../adr/ADR-019-workload-identity-irsa.md), [ADR-020](../adr/ADR-020-aws-data-services-mapping.md)  
**Related**: [gitops-argocd.md](gitops-argocd.md) (packaging), [terraform-infrastructure.md](terraform-infrastructure.md#outputs-contract) (parameter names)

What each deployable needs from the platform, and what must change in manifests or code before it runs on EKS. File references are to the working tree on 2026-10-30.

## Image build contract

| Service (ECR `cms-demo/<service>`) | Build context | Dockerfile | Runtime | Port | UID |
|---|---|---|---|---|---|
| `cms-backend` | `backend/` | `backend/Dockerfile` | .NET 9 (`aspnet:9.0`) | 8080 | 1654 |
| `media-worker` | `backend/` | `backend/DemoCms.MediaWorker/Dockerfile` | .NET 9 (`runtime:9.0`) | — | 1654 |
| `cms-frontend` | `frontend/` | `frontend/Dockerfile` | Node 18 build → `nginx-unprivileged:alpine` | 8080 (Service 80) | 101 |
| `canvas-backend` | `canvas-backend/` | `canvas-backend/Dockerfile` | .NET 8 (`aspnet:8.0`) | 8080 | 1654 |
| `canvas-frontend` | `canvas-frontend/` | `canvas-frontend/Dockerfile` | Node 18 build → `nginx-unprivileged:alpine` | 8080 (Service 80) | 101 |
| `canvas-load` | `loadgen/canvas-load/` | `loadgen/canvas-load/Dockerfile` | `playwright:v1.49.0-jammy` | 8090, 9091 | root |

All images are built for `linux/arm64` (Graviton nodes, Apple Silicon host) and tagged `sha-<12 hex>`; `:latest` and `imagePullPolicy: IfNotPresent` on local names are no longer used.

**Runtime lifecycle (blocking for `prod`, recommended before `dev` go-live)**: .NET 8 and .NET 9 both reach end of support on **2026-11-10**. `cms-backend`, `media-worker` (net9.0) and `canvas-backend` (net8.0) move to .NET 10 LTS (supported to November 2028). The Node 18 build stage of both frontends (end of life since April 2025) moves to a current LTS.

## Per-service contract

### cms-backend

- **Replicas / strategy**: 1, `strategy: Recreate` (RWO volumes; a rolling update would schedule a second pod that cannot attach the EBS volume).
- **Storage**: `backend-data-pvc` 1 GiB → `/app/data` (SQLite `media.db`); `backend-uploads-pvc` 10 GiB → `/app/uploads`. Names kept for continuity; prune/delete protection.
- **Config (literal)**: `ASPNETCORE_ENVIRONMENT=Production`, `ASPNETCORE_URLS=http://+:8080`, `ConnectionStrings__DefaultConnection=Data Source=/app/data/media.db`, `Storage__Path=/app/uploads`, `MediaEvents__Enabled=true`, `MediaEvents__Topic=media.uploaded`, `MediaEvents__PublicBaseUrl=http://cms-backend:8080` (**fix**: the default `http://demo-cms-api` does not resolve, so the worker cannot fetch files today), `OpenTelemetry__OtlpEndpoint=http://$(NODE):4318`, `OpenTelemetry__EnablePrometheusExporter=true`, `OpenTelemetry__ServiceVersion` = image tag.
- **Config (ExternalSecret `app-endpoints`)**: `MediaEvents__BootstrapServers` ← `KAFKA_BOOTSTRAP_SERVERS`; `Cors__Origin` ← `PUBLIC_ORIGIN`.
- **Probes**: `/healthz`, `/ready` (static; no dependency checks).
- **Ingress from**: `edge` (Envoy), `media-worker`, `canvas-frontend` (its nginx proxies `/api/media`), `canvas-load`.
- **Egress to**: Kafka, OTLP on the node IP, optional search endpoint.
- **Identity**: none in phase 1–2; phase 3 IRSA role for the S3 media bucket.
- **Behaviour to know**: uploads await the Kafka produce; an unreachable broker blocks uploads up to librdkafka's default 300 s message timeout (made configurable by ADR-020 phase 3.1).

### media-worker

- **Replicas**: 1 (topic has 3 partitions, so it can scale to 3 later).
- **Config (literal)**: `Kafka__Topic=media.uploaded`, `Kafka__GroupId=demo-cms-media-worker`, `Kafka__AutoOffsetReset=Earliest`, `Kafka__EnableAutoCommit=false`, `Api__BaseUrl=http://cms-backend:8080`, `OpenAI__Prompt`, `OpenTelemetry__OtlpEndpoint=http://$(NODE):4318`.
- **Config (ExternalSecrets)**: `Kafka__BootstrapServers` ← `KAFKA_BOOTSTRAP_SERVERS`; `OpenAI__BaseUrl` ← `LLM_BASE_URL`; `OpenAI__Model` ← `LLM_MODEL`; `OpenAI__ApiKey` ← `OPENAI_API_KEY`.
- **Probes**: none possible (no HTTP listener); restart-on-crash only.
- **Egress to**: Kafka, `cms-backend:8080`, the captioning endpoint (Q5), OTLP.
- **Until Q5**: placeholders (`http://llm.invalid/v1`, model `none`, key `none`) keep the worker running: it consumes and fetches each file, the caption call fails fast (NXDOMAIN), and nothing is written back. `ChatClient` is built at startup, so an empty base URL or key would crash-loop the pod; placeholders are never empty.
- **Blocking bug before enabling captioning**: the worker PUTs only `Description`; `MediaService.UpdateAsync` assigns `Title` unconditionally (`backend/DemoCms.Infrastructure/Services/MediaService.cs:180`), so each caption nulls the title or fails the update.

### cms-frontend

- **Replicas**: 1 (`local`), 2 (`dev`), with a PDB `minAvailable: 1` and zone topology spread.
- **Config**: `BACKEND_HOST=cms-backend:8080`; `CORALOGIX_RUM_DOMAIN=eu1.coralogix.com`, `CORALOGIX_APPLICATION=cms-demo`, `CORALOGIX_SUBSYSTEM=cms-frontend`, `CORALOGIX_ORGANIZATION_NAME`, `CORALOGIX_ENVIRONMENT` (overlay), `CORALOGIX_APP_VERSION` (image tag), sampling/recording flags, `CORALOGIX_OTLP_TRACES_URL=/v1/traces`.
- **Secret**: `CORALOGIX_RUM_PUBLIC_KEY` ← ExternalSecret `rum-keys` from `cms-demo/<env>/coralogix-rum` (**fix**: currently hard-coded at `k8s/frontend-deployment.yaml:36`, committed to the public repo). An empty value disables RUM (the SDK checks for it), which is the placeholder.
- **Probes**: `/health`.
- **Note**: the entrypoint writes `runtime-env.js` and the nginx config at start, so `readOnlyRootFilesystem` needs emptyDir mounts (hardening backlog).

### canvas-backend

- **Replicas / strategy**: 1, `strategy: Recreate`; SignalR presence is in memory (ADR-020 phase 4 for scale-out).
- **Storage**: `canvas-backend-data-pvc` 1 GiB → `/app/data` (SQLite `whiteboard.db`, migrations + seed at startup).
- **Config (literal)**: `ConnectionStrings__Sqlite=Data Source=/app/data/whiteboard.db`, `OpenTelemetry__OtlpEndpoint=http://$(NODE):4318`, `OpenTelemetry__ServiceName=demo-canvas-api`, `RUM_DEMO_ENABLED=false`.
- **Config (ExternalSecret)**: `Cors__Origin` ← `PUBLIC_ORIGIN` (**fix**: currently `http://localhost`, wrong for any real host; the API uses `AllowCredentials`, so the origin must match exactly).
- **Routes**: `/api/boards`, `/hubs` (WebSocket upgrade; request timeout off, idle timeout 3600 s).
- **Probes**: `/healthz`, `/ready`.

### canvas-frontend

- **Replicas**: as cms-frontend.
- **Config**: `BACKEND_HOST=canvas-backend:8080`, `CMS_HOST=cms-backend:8080`, `CORALOGIX_*` as above with subsystem `canvas-frontend`; lag-simulation and RUM-demo flags off in base, switched on only by the `rum-lag-sim` / `rum-large-board` components.
- **Secret**: `CORALOGIX_RUM_PUBLIC_KEY` ← `rum-keys` (**fix**: hard-coded at `k8s/canvas-frontend-deployment.yaml:38`).
- **Probes**: `/health`.

### canvas-load (component `loadgen`)

- **Workload**: StatefulSet `canvas-load` (replicas 1 = `shard.count`), headless Service, ConfigMap `canvas-load-config`; the namespace `cms-demo` is hard-coded in the leader URL, so the namespace name must not change.
- **Service**: **`ClusterIP`** for 8090/9091 (**fix**: `type: LoadBalancer` today would publish the unauthenticated control API through a cloud load balancer). The admin UI is never routed: it calls absolute `/api/control/*` paths and `PUT /api/control/config` can aim the browsers at any URL. Access is `kubectl port-forward` only.
- **Target**: today it drives `http://cms-frontend/cms` directly, so browser RUM POSTs to `/v1/traces` hit nginx with no such location and are lost. The target becomes per-overlay so synthetic traffic follows the browser path: `local` uses the Gateway Service `http://cms-edge.edge.svc.cluster.local:443/cms` (routes have no hostnames and no proxy protocol there); `dev` uses the public `https://cms-dev.<domain>/cms` through the NAT gateway, whose EIPs Terraform adds to the NLB allowlist (in-cluster calls to the Gateway would fail on AWS: routes require the public hostname and the listener expects proxy protocol). `resolveTargetUrl.ts` already accepts any non-localhost URL.
- **Security**: runs as root (no `USER`); allowed by PSA `baseline`; hardening backlog: `USER pwuser`.
- **Build hygiene (fix)**: add `.dockerignore` (`node_modules`, `dist`, `reports`); today `COPY . .` overwrites the `npm ci` result with host-built modules.
- **Cost note**: headless Chromium sessions send real RUM to Coralogix (R6 in the architecture risks).

### kafka-topics (new Job)

- Image `apache/kafka` (pinned, multi-arch), `kafka-topics.sh --create --if-not-exists` for `media.uploaded` and `otel-logs`, 3 partitions, replication factor from `KAFKA_REPLICATION_FACTOR`, bootstrap from `KAFKA_BOOTSTRAP_SERVERS`.
- Argo CD Sync hook, wave -1, `BeforeHookCreation` delete policy; works against floci Redpanda and MSK alike.

## Cross-cutting manifest standards

- Keep: `automountServiceAccountToken: false`, `seccompProfile: RuntimeDefault`, `allowPrivilegeEscalation: false`, capabilities dropped, requests and limits on every container.
- Add: recommended labels (`app.kubernetes.io/name`, `part-of: cms-demo`, `version`), PDBs and zone spread for multi-replica tiers in `dev`/`prod`, a `build-info` ConfigMap (`APP_VERSION`) written by the same promotion commit that changes image tags, and `reloader.stakater.com/auto: "true"` on every workload that reads an ESO-managed Secret.
- NetworkPolicy: default-deny ingress for `cms-demo`; allow from namespace `edge` to the four HTTP services, intra-namespace calls listed above, and nothing else. Egress stays open in phase 1–2 (browser RUM, Kafka, OTLP, captioning).
- No base manifest contains a registry, an image tag, a hostname, a `storageClassName` or a floci address.

## Change summary

| Change | Type | Needed for |
|---|---|---|
| `strategy: Recreate` for cms-backend, canvas-backend | manifest | `dev` |
| `MediaEvents__PublicBaseUrl=http://cms-backend:8080` | manifest | `dev` (worker flow) |
| `Cors__Origin` from `PUBLIC_ORIGIN` | manifest | `dev` |
| RUM key from Secrets Manager | manifest | `dev` |
| loadgen Service `ClusterIP`, no route; per-overlay target URL | manifest | `dev` |
| Bare image names + per-environment registry and tags | manifest | `dev` |
| Kafka bootstrap from ExternalSecret; topics Job | manifest | `dev` |
| `.dockerignore` for `loadgen/canvas-load` | build | CI reproducibility |
| Pin `nginx-unprivileged` base tag/digest | build | supply-chain hygiene |
| .NET 10 for both backends + worker; Node LTS for frontend builds | code/build | `prod` (recommended before `dev`) |
| Title-null bug in `MediaService.UpdateAsync` | code | before enabling captioning |
| Loadgen target via Gateway (local) / public hostname (`dev`) | config | correct RUM in synthetic sessions |
| Kafka client passthrough, S3 store, PostgreSQL provider | code | ADR-020 phase 3 |
