# ADR-020: Mapping State and Messaging onto AWS Services (Phased)

**Status**: Proposed  
**Date**: 2026-10-30  
**Parent**: [ADR-017](ADR-017-aws-eks-gitops-platform.md)

## Context

Runtime dependencies as they exist in the code today (verified 2026-10-30):

| Concern | Current implementation | Evidence | Consequence |
|---|---|---|---|
| CMS metadata | SQLite `/app/data/media.db` on RWO PVC; provider chosen by sniffing the connection string (`Data Source=` → SQLite, else SQL Server); schema via `EnsureCreated`, no migrations | `backend/DemoCms.Api/Program.cs:25-38,209-213` | 1 replica; no schema evolution path |
| CMS media files | `LocalFileStore` behind `IMediaStore` on a 10 GiB RWO PVC | `DemoCms.Core/Interfaces/IMediaStore.cs`, `Program.cs:41-42` | 1 replica; swap is a new `IMediaStore` implementation |
| Canvas data | SQLite only (EF Core 8), committed SQLite migrations, seed at startup | `canvas-backend/src/Whiteboard.Infrastructure/*` | 1 replica; PostgreSQL needs provider + new migration set |
| Realtime | SignalR `/hubs/board`, presence in an in-memory singleton, no backplane | `canvas-backend/src/Whiteboard.Api/Program.cs:93-99`, `BoardPresenceStore.cs` | 1 replica until a backplane exists |
| Messaging | single-node `bitnamilegacy/kafka:3.9`, no volume, topic auto-create; clients set only `BootstrapServers` (no TLS/SASL options) | `KafkaMediaEventProducer.cs:26-30`, `MediaUploadedConsumer.cs:45-50` | unmaintained image; MSK reachable only over plaintext without a code change |
| Telemetry logs | Coralogix agent exports container logs to Kafka topic `otel-logs`, `otel-gateway` consumes (ADR-016) | `coralogix/values.yaml:174-180`, `k8s/otel-gateway-config.yaml` | Kafka is also an observability dependency |
| Search | optional Elasticsearch over raw `HttpClient`, index-only, no auth; disabled in k8s | `DemoCms.Api/ElasticExtensions.cs`, `ElasticService.cs` | can stay off |
| Captioning | OpenAI-compatible chat endpoint; manifests point at `http://llama:11434/v1`, which does not exist | `DemoCms.MediaWorker/Program.cs:105-114`, `k8s/media-worker-deployment.yaml:39-46` | needs a decision (open question Q5) |

## Evaluation Criteria

- **Time to first EKS deploy** without blocking on application changes.
- **Operational burden** of what the team must run itself.
- **Parity** with floci (which emulates MSK with Redpanda, RDS with real Postgres containers, S3 in-process).
- **Change risk**: avoid coupling infrastructure cut-over with application rewrites.

### Options scorecard (1 = worst, 5 = best)

| Characteristic | A: Everything in-cluster (SQLite/EBS + self-run Kafka) | B: Phased — SQLite/EBS + MSK first, managed data later | C: Big bang (RDS + S3 + MSK before first deploy) |
|---|---|---|---|
| Time to first deploy | 5 | 4 | 2 |
| Operational burden | 2 | 4 | 5 |
| Parity with floci | 3 | 5 | 4 |
| Change risk | 3 | 4 | 2 |
| **Total** | **13** | **17** | **13** |

Sub-decisions considered:

- **RDS for SQL Server (no CMS code change)** vs **RDS PostgreSQL**: SQL Server Linux images are amd64-only (emulated on the arm64 Mac/floci), the canvas backend has no SQL Server provider either, and Express edition has no Multi-AZ and a 10 GB cap. PostgreSQL serves both apps natively on arm64. → PostgreSQL.
- **MSK** vs **Strimzi** vs **keep Bitnami**: the Bitnami legacy image receives no updates; Strimzi adds an operator to run; MSK is managed and floci-emulated. → MSK.
- **EFS (RWX) for uploads** to allow more CMS replicas early: pointless while SQLite pins the API to one replica. → No; go straight to S3 in phase 3.

## Decision

**Adopt Option B.**

### Phase 1–2 (first EKS deploy, no application code changes)

| Concern | AWS | floci (`local`) |
|---|---|---|
| CMS + canvas SQLite | EBS gp3 PVC (encrypted, `WaitForFirstConsumer`), Deployment `strategy: Recreate`, `replicas: 1`; daily AWS Backup snapshot via volume tags | k3s `local-path` PVC |
| CMS media files | EBS gp3 PVC, 10 GiB | `local-path` PVC |
| Kafka | MSK provisioned, 2 brokers in **2 AZs** (broker count must be a multiple of the client subnets; smallest type supported by the chosen Kafka version, `kafka.t3.small` if available), client-broker encryption `TLS_PLAINTEXT`, unauthenticated, SG allows only cluster nodes; `auto.create.topics.enable=false`; storage autoscaling off | floci MSK (Redpanda), PLAINTEXT |
| Topics | Argo CD Sync-hook Job in wave -1 (after the ExternalSecrets it reads) creates `media.uploaded` (3 partitions) and `otel-logs` (3 partitions); replication factor from SSM (2 on AWS) | same Job; replication factor 1 |
| Search | off (`Elasticsearch__Url` unset) | off |
| Captioning endpoint | `OpenAI__BaseUrl`/`Model` from SSM, key from Secrets Manager. Until Q5 is decided, Terraform writes placeholders (`http://llm.invalid/v1`, model `none`, key `none`): the worker consumes events and its calls fail fast (NXDOMAIN), so nothing is written back | same mechanism and placeholders |

Manifest-only fixes that ship with phase 1 are listed in [cms-demo-workload-contract.md](../components/cms-demo-workload-contract.md) (`Recreate` strategy, `MediaEvents__PublicBaseUrl`, CORS origin, loadgen Service type, image references).

### Phase 3 (application changes, each independently releasable)

1. **Kafka client passthrough**: bind a `...:Client` config section to librdkafka properties in producer and consumer, enabling `security.protocol=SSL` (MSK port 9094) and later `SASL_SSL` with MSK IAM. Then switch MSK to `TLS` only.
2. **S3 media store**: `S3MediaStore : IMediaStore`, selected by `Storage:Provider=s3`; bucket from SSM; IRSA role scoped to the bucket (ADR-019). The uploads PVC is removed. floci S3 locally (path-style).
3. **PostgreSQL**: explicit `Database:Provider` setting replaces connection-string sniffing; Npgsql for both backends; EF Core migrations for CMS (replacing `EnsureCreated`) and a PostgreSQL migration set for canvas; migrations run as an Argo CD Sync-hook Job in wave -1 (after the ExternalSecrets with the connection data), not at pod start. RDS PostgreSQL (single-AZ in `dev`, Multi-AZ in `prod`), master password managed by RDS in Secrets Manager. AWS environments start empty: no SQLite data migration.
4. **Search (optional)**: OpenSearch Service domain in VPC with a resource policy scoped to the cluster's security group (current unsigned client works), or SigV4 signing if the domain must be IAM-protected.

### Phase 4 (scale-out)

- SignalR backplane on ElastiCache (Valkey) with presence moved out of process; then `canvas-backend` replicas > 1. floci emulates ElastiCache with a Valkey container.
- HPA and PDBs for stateless tiers; MSK 3 brokers with IAM auth; RDS Multi-AZ.

## Implications

- **Positive**: First deploy needs only infrastructure and manifest work; each later step removes one single-replica blocker and is testable on floci before AWS.
- **Negative / Risks**:
  - EBS volumes pin `cms-backend` and `canvas-backend` to one AZ until phase 3; an AZ outage stops them (acceptable for `dev`).
  - Plaintext Kafka inside the VPC until phase 3.1 (SG-restricted; not acceptable for `prod`).
  - The agent → Kafka → gateway log path (ADR-016) loads MSK with all container logs; revisit sizing or export logs directly (open question Q7).
  - **Known bug blocking captioning**: the media worker PUTs only `Description`, and `MediaService.UpdateAsync` assigns `Title` unconditionally (`MediaService.cs:180`), so every caption nulls the title (or fails if the column is required). Fix before enabling captioning in any environment.
- **Follow-up actions**: Terraform modules `msk`, `app-config` (phase 1) and `s3-media`, `rds-postgres`, `opensearch` (phase 3) per [terraform-infrastructure.md](../components/terraform-infrastructure.md).

## Consultation

Code survey of `backend/`, `canvas-backend/`, `frontend/`, `canvas-frontend/`, `loadgen/canvas-load/`; ADR-002 (single-replica SignalR assumption), ADR-016 (Kafka log pipeline); floci docs for MSK, RDS, S3, OpenSearch, ElastiCache.
