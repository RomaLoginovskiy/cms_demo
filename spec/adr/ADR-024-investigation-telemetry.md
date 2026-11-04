# ADR-024: Investigation-Grade Telemetry, Change Events and Detection as Code

**Status**: Proposed  
**Date**: 2026-11-02  
**Parent**: [ADR-023](ADR-023-incident-workshop.md) · **Related**: [ADR-016](ADR-016-coralogix-otel-helm-migration.md) (Coralogix chart), [ADR-020](ADR-020-aws-data-services-mapping.md) · **Amended by**: [ADR-025](ADR-025-coralogix-annotations.md) (decision 4: Argo CD and Terraform change events go to the ops-events API as annotations)  
**Spec**: [workshop-telemetry-detection.md](../components/workshop-telemetry-detection.md)

## Context

An investigation moves from symptom to cause through four questions:

1. What do users feel?
2. Where in the request path does it happen?
3. Which resource is the bottleneck?
4. What changed?

Today's telemetry answers parts of the first three and almost none of the fourth:

| Question | Available today | Missing |
|---|---|---|
| What users feel | RUM (both frontends); span metrics | latency percentiles above 200 ms (histogram bounds stop at 200 ms); the edge view (Envoy) |
| Where in the path | backend spans: ASP.NET Core, EF Core, worker HttpClient | database driver spans and pool metrics (Npgsql); Kafka spans and trace context across the topic; Envoy spans and access logs; trace IDs in API logs |
| Which resource | kubeletstats; cAdvisor throttling; host metrics; `k8s_cluster`; Kubernetes events | PostgreSQL server metrics; Kafka consumer lag; Argo CD, KEDA and Cluster Autoscaler metrics; AWS CloudWatch (EC2, EBS, MSK, NLB, NAT) |
| What changed | Kubernetes events (Argo CD Application events, rollouts, HPA rescales); `service.version` on spans. Since [ADR-025](ADR-025-coralogix-annotations.md), Argo CD Notifications, CI and `tf.sh` post Coralogix annotations (ops events) with an events-only key | AWS API changes (CloudTrail); anything AWS-shaped on floci |

Detection is configured by hand in the Coralogix UI today, if at all; nothing can be reproduced per environment.

## Evaluation Criteria

- Investigation value.
- Works the same on floci and AWS.
- Secret hygiene: the ingest key stays in `observability`.
- Cardinality and Coralogix units.
- Maintenance cost of chart overrides.

### Options scorecard (1 = worst, 5 = best)

| Decision area | Options (score) | Chosen |
|---|---|---|
| Latency histograms | Override `presets.spanMetrics.histogramBuckets` with 13 bounds from 5 ms to 30 s (5).<br>Keep the defaults and rely on raw spans (2): APM percentiles stay capped | **Override** |
| Change events | Kubernetes events only (3): already collected, but no commit author or message and nothing from AWS.<br>Coralogix annotations through the ops-events API (ADR-025) for Argo CD and Terraform, plus CloudTrail-shaped events for AWS changes (5): native change markers in APM and dashboards, events-only key.<br>Argo CD Notifications → OTLP logs through the in-cluster agent (4): queryable as logs, but no native markers; superseded by ADR-025 | **Build on ADR-025; add AWS change events** |
| AWS signals on floci | Emulated from real local signals, labelled `cloud.emulated=true` (owner's decision for the demo).<br>None: AWS stays a talk track | **Emulated** |
| Database metrics | OTel `postgresql` receiver (5): the same metric names for CloudNativePG now and RDS later.<br>CloudNativePG exporter scrape only (3): richer CNPG detail, but the names change when RDS arrives | **`postgresql` receiver**; CNPG exporter optional in `lab` |
| Kafka metrics | OTel `kafkametrics` receiver (5): works on Redpanda and MSK alike.<br>MSK CloudWatch only (2): AWS only, and coarser | **`kafkametrics`**; MSK CloudWatch as an AWS cross-check |
| AWS metrics | CloudWatch Metric Streams → Firehose → Coralogix with Coralogix's Terraform module (5): push-based, minutes of delay, no pollers.<br>In-cluster CloudWatch poller (2) | **Metric Streams** |
| Detection definitions | Terraform with the Coralogix provider in a new `observability` stack (5): per environment, reviewable, same flow as infrastructure.<br>`cx` CLI scripts (3).<br>UI only (1) | **Terraform** |

## Decision

1. **Span metrics** (all environments):
   - Histogram bounds `[5ms, 10ms, 25ms, 50ms, 100ms, 150ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s, 30s]` for every span-metrics connector of the chart. The 150 ms bound sits on the baseline p95 target, so that check is not interpolated.
   - Remove the unused `spanmetrics/db2` connector.
   - Keep the `service.version` dimension.
2. **Application instrumentation** (all environments):
   - Trace-correlated logs from the API: OTLP logs as the worker already does, or JSON console with trace IDs.
   - .NET runtime metrics.
   - Npgsql tracing and pool metrics, replacing EF Core instrumentation so DB spans are not duplicated.
   - HttpClient and AWS SDK instrumentation in the API.
   - Kafka producer and consumer spans with W3C trace context in message headers.
3. **Collector additions** (Coralogix chart values):
   - `postgresql` and `kafkametrics` receivers in the cluster collector.
   - Prometheus scrapes, each with a keep-list, for Argo CD, KEDA, Cluster Autoscaler, Envoy proxies, the load generator and (optionally) CloudNativePG.
   - kubeletstats limit-utilisation metrics.
   - Envoy Gateway: JSON access logs, and OTLP tracing to the node agent.
   - The observability ESO identity gains read access to `/cms-demo/<env>/kafka/*` (Parameter Store, for `kafkametrics`) and to `cms-demo/<env>/db-monitoring`. Until now it read only the ingest key ([aws-eks-platform.md](../architecture/aws-eks-platform.md) §10).
4. **Change events: [ADR-025](ADR-025-coralogix-annotations.md) amends this item** (Coralogix annotations):
   - Argo CD syncs, builds and Terraform applies are ops events. They are drawn on charts and stored in the `default/ops.events` dataset, which DataPrime can query.
   - They carry `commitAuthor` and `commitSubject`, which the demo's change story relies on.
   - Kept here:
     - **AWS change events**: real CloudTrail on AWS. On `local`, the demo's AWS API calls (`PutParameter`, `PutRolePolicy`) are posted as emulated CloudTrail-shaped ops events through ADR-025's sender `infra/scripts/ops-event.sh` (item 5). They are `customEvent`s with `category=infrastructure`, `origin=aws-api` and `emulated=true`, which extends ADR-025's catalog.
     - **Kubernetes events**: the queryable baseline.
5. **AWS telemetry**:
   - **`local` (demo)**: an `aws-signal-emulator` derives AWS-shaped metrics and events from real local signals:
     - node CPU → `AWS/EC2`;
     - PostgreSQL I/O → `AWS/EBS`;
     - Redpanda's metrics → `AWS/Kafka`;
     - the demo's own AWS API calls → CloudTrail-shaped ops events (capturing floci's request log is a later option).

     Every series and event carries `cloud.emulated=true`. Names and dimensions copy the real integration (WS13).
   - **AWS environments**: a new module `coralogix-aws`, wrapping Coralogix's Terraform modules, delivers:
     - CloudWatch Metric Streams for `AWS/EC2`, `AWS/EBS`, `AWS/Kafka`, `AWS/NetworkELB`, `AWS/NATGateway` and `AWS/AutoScaling` (`AWS/RDS` once it exists);
     - CloudTrail.
6. **Detection as code**:
   - A Terraform stack `observability` (Coralogix provider) owns alerts, SLOs, dashboards and notification routing per environment.
   - Routing for the demo: alerts go to a Slack channel, where Olly is used in the alert thread.
   - Its Coralogix API key is read from Secrets Manager through the GitHub OIDC role and is never stored in GitHub.
   - Every alert, SLO, dashboard query and KEDA trigger filters on `k8s.cluster.name`. Several clusters can share one Coralogix team (for example `local` rehearsals next to `lab`).
7. **Workshop-only items**:
   - KEDA's query key `cms-demo/<env>/coralogix-query` (metrics read only);
   - the CloudNativePG scrape;
   - the `aws-signal-emulator`;
   - the workshop alert and SLO set.
8. **Readiness for Olly and Claude Code**: both investigate only what reaches Coralogix. That means:
   - consistent service names and `deployment.environment.name` ([ADR-025](ADR-025-coralogix-annotations.md));
   - change events with author and message;
   - Kubernetes, PostgreSQL and Kafka metrics;
   - trace-correlated logs;
   - the alert's own deep links.

   Spike WS12 checks which of these Olly uses for the demo team.

## Implications

- **Positive**:
  - Percentiles and alerts become meaningful above 200 ms.
  - Every scenario's cause becomes provable from Coralogix.
  - `dev` and `prod` gain change correlation and AWS visibility.
  - Detection becomes reviewable and reproducible.
- **Negative / Risks**:
  - More series: each span-metric histogram grows from 4 to 14 bucket series, and the new receivers add more. The component spec estimates the volume and spike WS3 measures it.
  - Chart overrides of collector pipelines must be rechecked on every `otel-integration` upgrade.
  - Two new keys (query, admin), each with a narrow scope.
  - Emulated AWS signals must never be mistaken for real ones: label, title and talk track all say so.
  - CloudWatch Metric Streams and Firehose cost money on AWS; small at this scale, priced per metric update.
  - The AWS change events extend ADR-025's event catalog (`origin=aws-api`); the two specs must stay in step.
- **Follow-up actions**:
  - Implement per [workshop-telemetry-detection.md](../components/workshop-telemetry-detection.md).
  - Run spikes WS2–WS6, WS10, WS12 and WS13 (WS8 in v2).

## Consultation

- Rendered chart configuration:
  - agent: the `spanmetrics*` connectors and the `prometheus/k8s_extra_metrics` keep-list;
  - cluster collector: `k8s_cluster`, `k8sobjects`, `transform/kube-events`.
- `backend/DemoCms.Api/Program.cs` and `backend/DemoCms.MediaWorker/Program.cs`.
- `deploy/platform/argo-cd/values.yaml`: notifications were disabled when this ADR was first written. The parallel ADR-025 work has since enabled them for Coralogix annotations (ops-events webhook, store `argocd-secrets`).
- `deploy/platform/envoy-gateway/proxy/*`: no telemetry settings.
