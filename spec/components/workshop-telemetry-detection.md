# Component: Workshop Telemetry and Detection

**Status**: Proposed (2026-11-02)  
**Decisions**: [ADR-024](../adr/ADR-024-investigation-telemetry.md)  
**Related**:
- [coralogix-otel-helm-migration.md](../architecture/coralogix-otel-helm-migration.md): chart
- [workshop-scenarios.md](workshop-scenarios.md): consumers of every signal
- [workshop-lab-platform.md](workshop-lab-platform.md)

This spec covers:

- what must be collected so every scenario is provable from Coralogix;
- how changes become events (building on [ADR-025](../adr/ADR-025-coralogix-annotations.md)'s Coralogix annotations);
- the emulated AWS signals of the local demo;
- how alerts reach Slack and Olly;
- the alerts, SLOs and dashboards (as code) that make up detection.

Items marked **all** also apply to `dev`/`prod`; **workshop** items apply only to clusters labelled `workshop=true`; **local demo** items only to the presenter's floci cluster; **AWS** items apply to `lab`/`dev`/`prod`.

## Signal inventory

| # | Signal | Today (chart 0.0.371, working tree 2026-11-02) | Change | Scope |
|---|---|---|---|---|
| S1 | Span metrics (APM, DB monitoring) | 4 connectors; bounds 50/100/200 ms; `spanmetrics/db2` unused | bounds 5 ms–30 s; delete `db2` | all |
| S2 | cms-backend traces | ASP.NET Core + EF Core (beta) + `media.tags.*` activities | Npgsql tracing replaces EF Core instrumentation; HttpClient; AWS SDK (S3); Kafka producer spans with `traceparent` in headers | all |
| S3 | media-worker traces | HttpClient | Kafka consumer span, parented from the message context | all |
| S4 | cms-backend logs | console text without trace IDs (`builder.Logging.AddConsole()` in `Program.cs`) | OTLP logs with trace and span IDs (as the worker already does) | all |
| S5 | cms-backend metrics | ASP.NET Core (OTLP) | + runtime (`System.Runtime` meter), Npgsql meter (pool usage, max, pending, timeouts) | all |
| S6 | Edge (Envoy) | nothing configured | JSON access logs to stdout; proxy metrics scrape; OTLP tracing to `otel-agent.observability:4317` | all |
| S7 | Kubernetes objects and events | `k8s_cluster`, `k8sobjects` events, resource catalog | document field paths; nothing new | all |
| S8 | Container resources | kubeletstats defaults; cAdvisor keep-list incl. CFS throttling | enable `k8s.container.cpu_limit_utilization`, `k8s.container.memory_limit_utilization`, `k8s.pod.cpu_limit_utilization` | all |
| S9 | PostgreSQL | none | `postgresql` receiver (cluster collector), user `otel_monitor`; CNPG exporter scrape optional | workshop now; RDS later |
| S10 | Kafka | none | `kafkametrics` receiver: brokers, topics, consumer groups (lag, members) | all |
| S11 | Argo CD | notifications post Coralogix annotations ([ADR-025](../adr/ADR-025-coralogix-annotations.md)); no metrics scrape | metrics scrape (application controller, repo server, server) | all |
| S12 | Autoscaling | HPA metrics via `k8s_cluster`; events | KEDA operator metrics; Cluster Autoscaler metrics | workshop |
| S13 | Synthetic users | none scraped | `canvas-load` `:9091`; k6 OTel output | all where enabled |
| S14 | AWS metrics | none | `local`: emulated by `aws-signal-emulator`, labelled; AWS: CloudWatch Metric Streams | local demo, AWS |
| S15 | AWS API changes | none | `local`: emulated CloudTrail-shaped ops events from the demo tooling's AWS calls; AWS: CloudTrail | local demo, AWS |
| S16 | Terraform applies | ops events from `tf.sh` (ADR-025) | none | all |
| S17 | RUM | both frontends, span export (ADR-013) | none | all |

## Collector configuration (Coralogix chart values)

### Span metrics (S1)

```yaml
opentelemetry-agent:
  presets:
    spanMetrics:
      histogramBuckets: [5ms, 10ms, 25ms, 50ms, 100ms, 150ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s, 30s]
      dbMetrics:
        enabled: true
  # connectors.spanmetrics/db2 is removed from base values (it is in no pipeline).
```

**Volume**: each histogram series grows from 4 to 14 bucket series. Estimate for `lab`:

- 3 services × ≈ 15 operations × ≈ 3 status/method combinations × 1–2 versions → ≈ 150–300 histogram series per connector;
- 4 connectors (`spanmetrics`, `compact`, `db`, `db_compact`) × 14 buckets → ≈ 8.5–17k bucket series, against ≈ 2.5–5k today.

WS3 measures the real number.

### Cluster collector additions (S9, S10, S11, S12, S13)

```yaml
opentelemetry-cluster-collector:
  extraEnvs:                       # ExternalSecrets in namespace observability
    - name: PG_MONITOR_PASSWORD    # store observability-secrets (workshop overlays only)
      valueFrom: {secretKeyRef: {name: db-monitoring, key: password, optional: true}}
    - name: KAFKA_BOOTSTRAP_SERVERS  # new store observability-parameters (prefix kafka)
      valueFrom: {secretKeyRef: {name: kafka-endpoints, key: KAFKA_BOOTSTRAP_SERVERS, optional: true}}
  config:
    receivers:
      postgresql:                  # workshop overlays only (lab, local with workshop=true)
        endpoint: cms-postgres-rw.cms-demo.svc.cluster.local:5432
        username: otel_monitor
        password: ${env:PG_MONITOR_PASSWORD}
        databases: [cms]
        collection_interval: 30s
        tls: {insecure_skip_verify: true}
      kafkametrics:
        brokers: ${env:KAFKA_BOOTSTRAP_SERVERS}   # same SSM value the apps use
        scrapers: [brokers, topics, consumers]
        collection_interval: 30s
      prometheus/platform:
        config:
          scrape_configs:          # kubernetes_sd + keep-lists; job names below
            - job_name: argocd               # argocd-metrics:8082, argocd-server-metrics:8083, argocd-repo-server:8084
            - job_name: keda                 # keda-operator:8080 (workshop)
            - job_name: cluster-autoscaler   # :8085 (lab)
            - job_name: envoy                # envoy pods :19001/stats/prometheus (edge)
            - job_name: canvas-load          # canvas-load-0:9091
            - job_name: cnpg                 # optional, instances :9187 (workshop)
    service:
      pipelines:
        metrics:
          receivers: [k8s_cluster, prometheus, prometheus/k8s_apiserver_metrics, otlp,
                      postgresql, kafkametrics, prometheus/platform]
```

Implementation notes:
- **Keep-lists**: every scrape job has `metric_relabel_configs` that keep only the metrics the alerts, dashboards and query cookbook use.
- **Scope**: `postgresql` and the CNPG scrape live only in `overlays/lab` and `overlays/local-workshop`; `kafkametrics` and the other scrapes are base values.
- **Credentials** (real store names: `app-secrets`, `app-parameters`, `observability-secrets`):
  - The `postgresql` receiver needs ExternalSecret `db-monitoring` in `observability`, from store `observability-secrets`. The observability reader scope in `stacks/infra` gains `cms-demo/<env>/db-monitoring`.
  - `KAFKA_BOOTSTRAP_SERVERS` needs a new ClusterSecretStore `observability-parameters` (Parameter Store, restricted to `observability`) and the `kafka` prefix in the observability reader scope, which today has `parameter_prefixes = []`.
- **Network policy**: cms-demo's ingress policy must allow the collector (see [workshop-lab-platform.md](workshop-lab-platform.md#network-policies-additions)).
- **Restarts**: the collector is **not** Reloader-annotated for `app-endpoints`. This is intentional, and INC-4 relies on it: a bad bootstrap value does not blind Kafka monitoring.

### Edge (S6)

The `EnvoyProxy` resources ([aws](../../deploy/platform/envoy-gateway/proxy/aws/envoyproxy.yaml), [floci](../../deploy/platform/envoy-gateway/proxy/floci/envoyproxy.yaml)) gain `spec.telemetry`:

- **Access log**: JSON to stdout with these fields:
  - `start_time`, `method`, `path`, `route_name`, `response_code`;
  - `response_flags` (`UT`, `URX`, `UH`, `UF`, `UO`, `NR`, `DC`);
  - `upstream_host`, `upstream_cluster`, `upstream_service_time`, `duration`, `upstream_request_attempt_count`;
  - `bytes_sent`, `x_request_id`, `traceparent`.

  The agent's filelog pipeline already ships container stdout; the `edge` namespace becomes application `edge` in Coralogix.
- **Tracing**: OpenTelemetry provider to `otel-agent.observability.svc.cluster.local:4317`, sampling 100 % in `lab`/`local`. Edge spans become parents of the API's server spans.
- **Metrics**: Prometheus endpoint enabled, scraped by job `envoy`.

WS6 confirms field names, the default route timeout and the tracing provider shape for Envoy Gateway 1.9.

### Application instrumentation (S2–S5)

| Service | Add | Remove |
|---|---|---|
| cms-backend (`demo-cms-api`) | `Npgsql.OpenTelemetry` tracing; meter `Npgsql`; `System.Runtime` meter; HttpClient instrumentation; AWS SDK instrumentation (S3); producer span `media.uploaded publish` with W3C context injected into Kafka headers; OTLP log exporter (trace-correlated) | EF Core instrumentation, which would duplicate DB spans |
| media-worker (`demo-cms-media-worker`) | consumer span `media.uploaded process`, with the context extracted from headers as parent; `System.Runtime` meter | — |

- Kafka instrumentation is either the contrib `OpenTelemetry.Instrumentation.ConfluentKafka` package or a small hand-written `ActivitySource`; the choice is made at implementation, with pinned versions.
- Health endpoints (`/healthz`, `/ready`) are filtered out of traces.

### Kubelet stats (S8)

`opentelemetry-agent.config.receivers.kubeletstats.metrics` enables:
- `k8s.container.cpu_limit_utilization`;
- `k8s.container.memory_limit_utilization`;
- `k8s.pod.cpu_limit_utilization`.

**Naming trap**: the chart's `transform/kubeletstatscpu` renames `container.cpu.usage`, `k8s.pod.cpu.usage` and `k8s.node.cpu.usage` to `*.cpu.utilization`, but the values are still **cores**. Queries and skills use the renamed metrics and say so.

## Change events (S11, S15, S16)

**Design owner**: [ADR-025](../adr/ADR-025-coralogix-annotations.md) and [coralogix-annotations.md](coralogix-annotations.md). Builds, Argo CD syncs and Terraform applies are posted as **Coralogix annotations** (ops events):
- they draw on APM and dashboard charts and are stored in the `default/ops.events` dataset, which DataPrime and `cx` can query;
- every event carries `commitAuthor`, `commitSubject` and the commit SHA;
- deployment events are per APM service (`demo-cms-api`, `demo-cms-media-worker`, `demo-canvas-api`) and matched on `deployment.environment.name`.

What this spec relies on, and what it adds:

| Item | Status | Why it matters here |
|---|---|---|
| Author and subject on every sync event | ADR-025: `repo.GetCommitMetadata` for single-source apps; the `cms-demo` app is single-source, also with the workshop components | Olly and Claude Code can name Dana's FIN-142 or Lee's SEC-311 |
| Queryable change history | ADR-025: `default/ops.events` | the `change_timeline` query, WF4 |
| **AWS API changes** as change events | **added here**. On `local`: the demo tooling's AWS calls (`PutParameter`, `PutRolePolicy`) are posted through ADR-025's sender `infra/scripts/ops-event.sh` as `customEvent`, `category=infrastructure`, `origin=aws-api`, `emulated=true`, with CloudTrail fields in `additional`. On AWS: real CloudTrail, shipped as logs | INC-4 and INC-8 are AWS changes with no Git trail |

**AWS change-event shape**: the ops event's `attributes.additional`, strings only; ADR-025's common keys are added by the sender. Parameter values are never recorded, as in CloudTrail.

```json
{
  "category": "infrastructure",
  "origin": "aws-api",
  "emulated": "true",
  "eventSource": "ssm.amazonaws.com",
  "eventName": "PutParameter",
  "actor": "arn:aws:iam::000000000000:user/aiko.tanaka",
  "resource": "/cms-demo/local/kafka/bootstrap_brokers",
  "awsRegion": "eu-west-1"
}
```

**Kubernetes events** stay the queryable baseline (`service.name=kube-events`). Useful reasons:
- Argo CD: `OperationStarted`, `OperationCompleted`, `ResourceUpdated`;
- rollouts and scaling: `ScalingReplicaSet`, `SuccessfulRescale`, `TriggeredScaleUp`;
- scheduling and health: `FailedScheduling`, `Killing`, `BackOff`, `Unhealthy`;
- ExternalSecret `Updated`.

OOM kills show up as the container's last terminated reason, not as an event: `OOMKilling` needs node-problem-detector, which is not installed.

The `lab-*` tooling emits nothing itself. The only exception is the CloudTrail fallback below, which records the AWS calls it makes as an emulated AWS service would.

## Emulated AWS signals (local demo)

floci emulates AWS APIs but emits no CloudWatch metrics and no CloudTrail. The **`aws-signal-emulator`** derives AWS-shaped signals from real local ones. It is a small OpenTelemetry Collector `Deployment` in `observability`, selected by `workshop=true` and `cloud=floci`, exporting to the node agent:

| Emulated signal | Shape (namespace · metric · dimension) | Real source on `local` | Used in |
|---|---|---|---|
| EC2 CPU | `AWS/EC2` · `CPUUtilization` (%) · `InstanceId=i-emulated-cms-local-1` | k3s node CPU: `k8s.node.cpu.utilization` (cores) ÷ allocatable × 100 | INC-1 (panel), INC-6 |
| EBS volume I/O | `AWS/EBS` · `VolumeReadOps`, `VolumeWriteOps`, `VolumeQueueLength` · `VolumeId=vol-emulated-cms-postgres-1` | PostgreSQL block read/write rates from the `postgresql` receiver (or cAdvisor fs counters, if WS13 shows they are populated on k3s) | INC-1, INC-5 |
| MSK broker | `AWS/Kafka` · `CpuUser`, `BytesInPerSec`, `BytesOutPerSec` · `Cluster Name=cms-local` | Redpanda `/public_metrics` (admin port 9644) | INC-4 (brokers healthy) |
| MSK consumer lag | `AWS/Kafka` · `SumOffsetLag` · `Consumer Group`, `Topic` | `kafkametrics` lag | INC-2 |
| CloudTrail | ops `customEvent` with CloudTrail fields (shape above), `origin=aws-api` | the AWS CLI wrapper of `lab-inject`/`lab-fix`, through `ops-event.sh`. Capturing floci's request log, so that any AWS call is covered, is a later option (WS13) | INC-4, INC-8 |

**As built (2026-11-02, EC2 and EBS only)**: a small standard-library Python `Deployment` instead of a Collector, in [`deploy/platform/coralogix-otel/overlays/local/aws-signal-emulator/`](../../deploy/platform/coralogix-otel/overlays/local/aws-signal-emulator/). It sends OTLP to the node agent every 60 s.
- **EC2**: `CPUUtilization` is node usage from `metrics.k8s.io` divided by the node's CPU capacity, averaged over 15 s samples. `StatusCheckFailed` comes from the node's `Ready` condition.
- **EBS**: there is no `postgresql` receiver yet, and cAdvisor's `container_fs_*` counters are 0 on k3s (WS13). So the source is `/proc/diskstats` of the node disk, which holds the local-path volumes including `cms-postgres`. The volume is `vol-emulated-cms-local-root`, with `VolumeReadOps`, `VolumeWriteOps`, `VolumeReadBytes`, `VolumeWriteBytes`, `VolumeQueueLength` and `VolumeIdleTime`.
- **Names in Coralogix**: `amazonaws_com_AWS_<Namespace>_<MetricName>`, the shape Coralogix documents for Metric Streams, with dimensions (`InstanceId`, `VolumeId`) and `cloud_emulated="true"` as labels.
- **Not built yet**: MSK and CloudTrail.

Rules:

- **Labels**: every series and event carries `cloud.emulated=true`, `cloud.provider=aws`, `cloud.region=eu-west-1` and `k8s.cluster.name`. As built, Coralogix keeps `cloud_emulated` and `k8s_cluster_name` as metric labels; the other `cloud.*` resource attributes are not labels.
- **Shape**: names, units and dimensions copy what Coralogix produces for real CloudWatch Metric Streams and CloudTrail (WS13), so dashboards, alerts and questions to Olly carry over to v2 unchanged.
- **Values**: derived from real signals only, never random or scripted, so they move with the incident.
- **Titles**: dashboard panels with emulated data are titled "AWS (emulated on floci)", and the presenter says so in the first minute.
- **Not emulated**: NLB, NAT, Auto Scaling and anything multi-AZ have no meaningful local source.

## Real AWS telemetry (`lab` in v2, `dev`, `prod`): module `coralogix-aws`


- **Metric streams**: wraps Coralogix's Terraform modules (Firehose metrics, AWS shipper) at pinned versions. Inputs: `coralogix_region = "EU1"`, `application_name`, the key from Secrets Manager, and `include_namespaces`.

  | Namespace | Used for |
  |---|---|
  | `AWS/EC2` | `CPUUtilization`, status checks per instance (INC-6, INC-1 on `lab`) |
  | `AWS/AutoScaling` | `GroupDesiredCapacity`, `GroupInServiceInstances` (INC-1, INC-7); needs group metrics collection enabled on the node group ASG |
  | `AWS/EBS` | `VolumeReadOps`, `VolumeQueueLength`, `VolumeIdleTime` (INC-1c, INC-7) |
  | `AWS/Kafka` | broker CPU, `BytesInPerSec`, `KafkaDataLogsDiskUsed`, consumer-lag metrics (INC-2, INC-4 cross-check) |
  | `AWS/NetworkELB` | `HealthyHostCount`, `UnHealthyHostCount`, `TCP_Target_Reset_Count` |
  | `AWS/NATGateway` | `ErrorPortAllocation`, `PacketsDropCount` |
  | `AWS/RDS` | once ADR-020 3.3 RDS exists (INC-10) |

- **CloudTrail**: the account trail to S3, shipped as described above.
- **Delay**: Metric Streams deliver within minutes, so the runbooks treat CloudWatch as corroboration rather than first signal. WS8 measures the delay and how Coralogix names the metrics.
- **floci**: replaced by the emulator above.

## SLIs and SLOs

| ID | SLI | Good events / valid events | Target (`lab`, 7-day window) |
|---|---|---|---|
| SLO-1 | Edge availability | responses < 500 / all responses on the `cms-edge` HTTPS listener (Envoy downstream counters). Measured at the edge so Envoy's own 503 `UH` and 504 `UT` count; server spans never see them (INC-3, INC-5) | 99.5 % |
| SLO-2 | API latency | `demo-cms-api` server spans ≤ 500 ms / all server spans, except the full list `GET /api/media` (slow by design, 300–700 ms) and health endpoints | 99 % |
| SLO-3 | CMS journey success | successful `canvas-load` CMS actions / all CMS actions | 98 % |

**Burn-rate alerts** (Coralogix SLO feature) page on a fast burn of 14.4× sustained over a 5-min **and** a 30-min window.

- **Window**: production would use 5 min / 1 h. `lab` shortens the long window so alerts can fire within a session.
- **Still slow by construction**: SLO-1's long window reaches its 7.2 % error threshold after 30 × 7.2 % ÷ *e* minutes at error ratio *e*:

  | Error ratio *e* | Time to fire |
  |---|---|
  | 50 % | ≈ 4 min |
  | 20 % | ≈ 11 min |
  | below 7.2 % | never |

The symptom threshold alerts A3 and A4 therefore page first. The WF2 deadlines for A1/A2 in the scenario spec follow this arithmetic.

## Alert catalog (`lab` and workshop-labelled `local`)

Every condition is scoped to the environment's cluster (`k8s.cluster.name`).

| ID | Name | Signal (cookbook query) | Condition | Sev | Scenarios |
|---|---|---|---|---|---|
| A1 | API latency SLO burn | SLO-2 | fast burn (5 min and 30 min) | P1 | INC-1, 3, 5 |
| A2 | Edge availability SLO burn | SLO-1 | fast burn (5 min and 30 min) | P1 | INC-1, 5; INC-0 only if errors exceed 7.2 % |
| A3 | Edge 5xx ratio | `edge_5xx_ratio` | > 2 % for 3 min | P2 | INC-0, 1, 3, 5, 7, 8 |
| A4 | CMS journey failures | `journey_success` per action type, plus RUM error rate | any action type < 80 % for 5 min | P2 | INC-0, 1, 4, 8 |
| A5 | DB connections near max | `db_connection_ratio` | > 0.8 for 2 min | P2 | INC-1 |
| A6 | Data tier CPU throttled | `db_throttle_ratio` | > 0.5 for 5 min | P3 | INC-1 |
| A7 | Autoscaler at max | `k8s_hpa_current_replicas >= k8s_hpa_max_replicas` | 5 min | P3 | INC-1 |
| A8 | Pods pending | `pods_pending` (namespace `cms-demo`) | > 0 for 5 min | P3 | INC-1, INC-7 |
| A9 | Container OOM-killed | restarts with last terminated reason `OOMKilled` | any | P3 | INC-5 |
| A10 | Argo CD application unhealthy | `argocd_app_info{health_status!="Healthy"}` | 5 min | P3 | INC-5, 7 |
| A11 | Kafka producer errors | log alert: cms-backend librdkafka errors | > 5 in 5 min | P3 | INC-4 |
| A12 | Node CPU saturated | `node_cpu_util` | > 0.9 for 5 min | P3 | INC-6 |
| A13 | Volume zone conflict | log alert: kube events `FailedScheduling` containing "volume node affinity conflict" | any | P2 | INC-7 |
| A14 | *(detection lab)* pipeline lag | `kafka_lag` | created by participants | — | INC-2 |

**Why the severity split**:
- **Symptoms page (P1/P2)**: they describe what users feel.
- **Causes inform (P3)**: they are clues that land in the same channel but do not page.

A14 is deliberately missing at baseline: INC-2 teaches the detection gap.

## Dashboards (as code)

| ID | Name | Content |
|---|---|---|
| D1 | Golden signals | RED per service and route (span metrics), edge 5xx and flags, RUM errors and page loads, SLO burn |
| D2 | Change timeline | the `changes` application and filtered kube events as a table and annotations, overlaid on p95, error ratio, cms-backend replicas and node count |
| D3 | Data stores | PostgreSQL: backends/max, CPU usage vs limit, throttling, commits/rollbacks, rows, DB span latency. Kafka: lag, members, broker count, producer errors |
| D4 | Platform | nodes and allocatable, pods by phase, restarts and reasons, throttling top-N, HPA/KEDA replicas and scaler value, Cluster Autoscaler, Argo CD sync/health |

Participants get D1–D4 read-only. The facilitator also uses `make lab-status`.

## Notification routing, Slack and Olly

- **Routing**: Coralogix notification routing (part of the `observability` stack) sends P1–P3 workshop alerts to a Slack channel: `#cms-demo-incidents` for the demo, one channel per workshop in v2.
- **Alert messages** carry:
  - the alert name with its environment prefix;
  - the service and route;
  - the value against its threshold;
  - deep links to the alert, the service in APM and dashboard D2.
- **Olly in the thread** (demo): the presenter asks Olly in the alert's Slack thread, and the investigation continues in the Coralogix UI from Olly's links. WS12 verifies the exact integration and the data Olly uses for the demo team. Olly readiness is ADR-024 item 8.
- **Cases**: P1 alerts can open a Coralogix Case (where enabled) as the investigation record.
- **No cross-paging**: CI and other non-demo clusters route nowhere, so rehearsal self-tests never page the demo channel.

## Detection as code: stack `observability`

| Item | Value |
|---|---|
| Root | `infra/terraform/stacks/observability`; state key `<env>/observability.tfstate` |
| Provider | `coralogix/coralogix` `~> 3.23`, `domain` from `coralogix_domain`, which `tf.sh` sets from `CX_DOMAIN` (the environment's one region setting, default `eu1.coralogix.com`). Terraform ≥ 1.7 (`import` with `for_each`) |
| Key | Target: `cms-demo/<env>/coralogix-admin` in Secrets Manager, read by the OIDC apply role; never in GitHub secrets or tfvars. **Today** (local only): environment variable `CORALOGIX_API_KEY`, which `tf.sh` reads from `infra/local/.secrets.env` for env `local`. The Secrets Manager lookup comes with the first AWS environment |
| Inputs | Committed (`envs/<env>/observability.tfvars`): `env`, `cluster_name`; nothing that names a Coralogix account. Per operator (env `local`: gitignored `infra/local/observability.tfvars`, from `observability.tfvars.example`, added by `tf.sh`): optional `console_url` (dashboard links in alert descriptions), optional `slack` (no connector or router without it), `rum_folder_name`, `adopt`. Later: thresholds, `workshop_alerts` |
| Resources | **Implemented 2026-11-03** for the incident demo: the two P1 alerts (API p95, cms-postgres FATAL), dashboards `cms-demo · API health` and the two RUM dashboards with their folder, and, when `slack` is set, a Slack connector (default name `slack-prod-alerts`) and router `cms-platform`. **Later**: alerts A1–A13, SLO-1–3, dashboards D1–D4, parsing rule for CloudTrail |
| Adoption | `adopt` (per operator) lists the IDs of objects that already exist in that team; `imports.tf` imports them, and `terraform output adopt_ids` prints the value after a first apply. Coralogix names are not unique, so without it a lost state (floci's bucket goes with `make local-nuke`) would duplicate every object; with it the next apply re-adopts them |
| Dashboards | JSON exported from Coralogix (`cx dashboards get <id>`, the `dashboard` object without `id` and `folderId`) in `stacks/observability/dashboards/`; the cluster name is substituted |
| Tests | `tests/observability.tftest.hcl` with a mocked provider, run by `make tf-validate` (routing labels match the router, links, cluster substitution, folders) |
| Naming | `[<cluster>] <alert name>`, so the `local` and `lab` copies do not collide in one Coralogix team |

## Query cookbook (indicative)

Metric and label names follow Coralogix's Prometheus naming for OTel data. On 2026-11-02 the following were verified live in the watcher team: `duration_ms_bucket`, `calls_total`, `db_duration_ms_bucket` (labels `service_name`, `span_kind`, `span_name`, `status_code`, `k8s_cluster_name`), `container_cpu_utilization_1`, `container_cpu_cfs_*_total_total`, `k8s_deployment_available__pod_`. The rest are **confirmed in WS3/WS4** (`cx metrics search`, `cx metrics get-labels`, `cx search-fields`) before they go into `queries.yaml`, alerts or dashboards.

`$CLUSTER` stands for the environment's cluster (`cms-local`, `cms-lab`). Every query carries it: on resource-attribute-based series it is `k8s_cluster_name="$CLUSTER"`, which the chart's `resource/metadata` processor sets. The exact label name is confirmed in WS3.

| Name | PromQL / DataPrime (shape) |
|---|---|
| `api_p95_ms` | `histogram_quantile(0.95, sum by (le) (rate(duration_ms_bucket{k8s_cluster_name="$CLUSTER", service_name="demo-cms-api", span_kind="SPAN_KIND_SERVER", span_name!~".*(healthz\|ready).*"}[2m])))`. Also KEDA's trigger, with `$CLUSTER` fixed per environment |
| `api_error_ratio` | `sum(rate(calls_total{k8s_cluster_name="$CLUSTER", service_name="demo-cms-api", span_kind="SPAN_KIND_SERVER", status_code="STATUS_CODE_ERROR"}[5m])) / sum(rate(calls_total{k8s_cluster_name="$CLUSTER", service_name="demo-cms-api", span_kind="SPAN_KIND_SERVER"}[5m]))` |
| `route_error_ratio` | the above, `by (span_name)`, plus `by (service_version)` for version comparison |
| `db_cpu_usage_cores` | `sum by (k8s_pod_name) (container_cpu_utilization_1{k8s_cluster_name="$CLUSTER", k8s_namespace_name="cms-demo", k8s_container_name="postgres"})`: the chart renames usage to utilization and Coralogix appends the unit (`_1`); values are cores. **Verified 2026-11-02** |
| `db_cpu_limit_cores` | `max(k8s_container_cpu_limit{k8s_cluster_name="$CLUSTER", k8s_namespace_name="cms-demo", k8s_container_name="postgres"})` |
| `db_throttle_ratio` | `sum(rate(container_cpu_cfs_throttled_periods_total_total{k8s_cluster_name="$CLUSTER", namespace="cms-demo", container="postgres"}[5m])) / sum(rate(container_cpu_cfs_periods_total_total{k8s_cluster_name="$CLUSTER", namespace="cms-demo", container="postgres"}[5m]))` (cAdvisor counters get a second `_total`). **Verified 2026-11-02** |
| `db_connection_ratio` | `sum(postgresql_backends{k8s_cluster_name="$CLUSTER"}) / max(postgresql_connection_max{k8s_cluster_name="$CLUSTER"})`. Its ceiling is ≈ 0.95, because superuser and `reserved_connections` slots are never used by the app |
| `cms_backend_replicas` | `k8s_hpa_current_replicas{k8s_cluster_name="$CLUSTER", k8s_hpa_name="keda-hpa-cms-backend"}` |
| `pods_pending` | `count(k8s_pod_phase{k8s_cluster_name="$CLUSTER", k8s_namespace_name="cms-demo"} == 1)` |
| `node_cpu_util` | `k8s_node_cpu_utilization{k8s_cluster_name="$CLUSTER"} / on (k8s_node_name) k8s_node_allocatable_cpu{k8s_cluster_name="$CLUSTER"}` (cores ÷ cores) |
| `kafka_lag` | `sum by (group) (kafka_consumer_group_lag{k8s_cluster_name="$CLUSTER", group="demo-cms-media-worker", topic="media.uploaded"})` |
| `edge_5xx_ratio` | `sum(rate(envoy_http_downstream_rq_xx{k8s_cluster_name="$CLUSTER", envoy_response_code_class="5"}[5m])) / sum(rate(envoy_http_downstream_rq_total{k8s_cluster_name="$CLUSTER"}[5m]))`. Downstream counters include Envoy's locally generated `UH`/`UT` responses |
| `edge_retry_rate` | `sum by (envoy_cluster_name) (rate(envoy_cluster_upstream_rq_retry{k8s_cluster_name="$CLUSTER"}[5m]))` |
| `journey_success` | `sum by (action) (rate(canvas_load_actions_total{k8s_cluster_name="$CLUSTER", ok="true"}[5m])) / sum by (action) (rate(canvas_load_actions_total{k8s_cluster_name="$CLUSTER"}[5m]))` |
| `change_timeline` | two sources, merged on time:<br>1. `source default/ops.events`, filtered on `environment` (ADR-025), showing description, `additional.origin`, `additional.commitAuthor`, `additional.commitSubject`, `additional.eventName`;<br>2. `source logs \| filter $l.subsystemname == 'kube-events'` with the cluster filter, showing `$d.object.reason`, `$d.object.regarding.kind`, `$d.object.regarding.name`, `$d.object.note`.<br>Exact field paths are confirmed in WS4 (`source default/ops.events \| limit 10`) |
| `edge_flags` | `source logs \| filter $l.applicationname == 'edge' \| groupby $d.response_code, $d.response_flags aggregate count()`, with the cluster filter as above |
| `version_compare` | spans of `demo-cms-api` in `$CLUSTER`, grouped by `service.version` and route, aggregating count and error count (DataPrime), or `route_error_ratio by (service_version)` |

**Kube event field paths** come from the chart's `transform/kube-events`: `$d.object.reason`, `$d.object.note`, `$d.object.type`, `$d.object.regarding.{kind,name,namespace}`; subsystem `kube-events`.

## Verification

1. **WS3**: series count, names and labels as listed; APM Service Catalog shows p95/p99 above 200 ms.
2. **WS4**: an Argo CD sync appears in `changes` with author and message within 1 min.
3. **Baseline**: A1–A13 stay quiet for 1 h at baseline on `local` and `lab` (no false positives).
4. **Scenarios**: each scenario's `alerts_expected` fire within its signature deadlines (WF2), and every `queries.yaml` entry returns data for the run window (WF4).
5. **Least privilege**: the KEDA query key cannot write; the Terraform admin key is absent from GitHub secrets and from state.
