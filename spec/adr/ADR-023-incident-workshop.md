# ADR-023: Incident Detection and Investigation Demo and Workshop on cms-demo

**Status**: Proposed  
**Date**: 2026-11-02 (revised the same day after the owner's clarifications)  
**Related**: [ADR-017](ADR-017-aws-eks-gitops-platform.md) (platform), [ADR-020](ADR-020-aws-data-services-mapping.md) (phase 3 prerequisites), [ADR-024](ADR-024-investigation-telemetry.md) (telemetry and detection)  
**Spec**: [incident-workshop.md](../architecture/incident-workshop.md)

## Context

Goal: show, and later let people practise, detecting and investigating realistic incidents on cms-demo from end to end with Coralogix telemetry. The incidents must cross Argo CD, Kubernetes, AWS, autoscaling, networking and data stores.

**Owner decisions (2026-11-02)** that set the scope of v1:

| Topic | Decision |
|---|---|
| Audience | Coralogix customers |
| Format | a presenter-led live demo from the presenter's Mac on floci, 45–60 min: the flagship incident plus 1–2 shorter ones. The hands-on multi-team workshop becomes v2 |
| Investigation | the alert reaches Slack; the presenter chats with Olly in the thread; the investigation continues in the Coralogix UI; Olly proposes the fix |
| AI | Olly and Claude Code (cx CLI + skills) solve the same incident side by side; must be in the demo |
| Database | CloudNativePG |
| AWS | emulated AWS metrics on the laptop, clearly labelled as emulated |

Reference case (from the request):

1. A configuration change scales the database down until it runs out of CPU.
2. Request latency and errors rise and show in Coralogix APM (span metrics).
3. An autoscaler reacts to the latency and makes things worse.

Facts that shape the design (verified against the working tree on 2026-11-02):

| Fact | Evidence | Consequence |
|---|---|---|
| No database server exists. Both APIs use SQLite on RWO PVCs; PostgreSQL arrives in ADR-020 phase 3.3 | `deploy/apps/cms-demo/base/cms-backend/deployment.yaml` (`Data Source=/app/data/media.db`); no Npgsql in `backend/*/*.csproj` | the reference case needs a PostgreSQL server first |
| cms-backend cannot scale out: `strategy: Recreate`, uploads on an RWO volume | same deployment; ADR-020 phase 3.2/3.5 | horizontal scaling needs the S3 media store and PostgreSQL |
| No autoscaler of any kind: no HPA or KEDA; the `dev` node group is fixed (2, max 3) with no cluster autoscaler; floci is one k3s node (gap G1) | `infra/terraform/envs/dev/infra.tfvars`, `deploy/` | scaling behaviour has to be added for the workshop |
| Every in-cluster change goes through Argo CD (automated sync, prune, self-heal, 180 s reconciliation); every AWS change goes through Terraform | `deploy/platform/argo-cd/values.yaml`, ADR-017 | a fault can arrive exactly the way a real change does, with the same trail |
| Span-metric histograms stop at 200 ms (`[50ms, 100ms, 200ms]` in all four connectors); `spanmetrics/db2` is defined but sits in no pipeline | rendered `coralogix-opentelemetry-agent` config, chart 0.0.371 | APM percentiles cannot show anything above 200 ms, so an incident's latency is invisible |
| Already collected: kubeletstats, cAdvisor CFS throttling counters, `k8s_cluster` metrics (including HPA), Kubernetes events (including Argo CD Application events), container logs, RUM | rendered config: `prometheus/k8s_extra_metrics` keep-list, `k8sobjects` | throttling, scaling and Argo CD syncs are visible without new agents |
| Not collected:<br>– PostgreSQL metrics<br>– Kafka consumer lag<br>– Argo CD, Envoy and KEDA metrics<br>– Envoy access logs<br>– AWS CloudWatch metrics, CloudTrail<br>API logs are console text without trace IDs. There are no Kafka spans and no context propagation across the topic | `builder.Logging.AddConsole()` in `backend/DemoCms.Api/Program.cs`; `backend/DemoCms.Infrastructure/Messaging/KafkaMediaEventProducer.cs` | these gaps are closed by ADR-024 |
| The media worker commits a Kafka offset only after it has stored a caption. With today's placeholder captioning endpoint, nothing is ever committed, so consumer lag only grows | `backend/DemoCms.MediaWorker/Kafka/MediaUploadedConsumer.cs:99-124` | lag cannot work as a signal until captioning succeeds; the lab needs a caption stub |
| The browser load generator is closed-model (10 Chromium users with think time) | `deploy/apps/cms-demo/overlays/dev/patches/loadgen-config.yaml` | when the system slows, the load slows with it and hides saturation; an open-model source is needed |
| `local` (floci) is green; AWS `dev` is blocked on Q1, Q3 and Q4 | [aws-eks-delivery-plan.md](../architecture/aws-eks-delivery-plan.md) | the workshop must be buildable and rehearsable on floci |
| [k8s-servant/k8s-skills](https://github.com/k8s-servant/k8s-skills) (Apache-2.0, 30 skills) covers cluster state. It uses read-only / ask-first / never command tiers and scenario rubrics built from `break.sh`, `cleanup.sh` and `expected.md`. It has no metrics, traces, change timelines, EKS/AWS or Kafka | repository review, 2026-11-02 | reuse its format and rubric; add the telemetry-driven layer it lacks |

## Evaluation Criteria

- **Realism**: faults arrive the way real changes do and leave the same trail (commit, sync, apply, event).
- **Provability**: every root cause can be proven from Coralogix alone.
- **Repeatability**: symptoms are deterministic and a reset takes under 10 minutes.
- **Rehearsability**: the workshop can be built and tested on floci without AWS.
- **Safety**: no blast radius outside the workshop environment; nothing reaches `dev` or `prod`.
- **Cost**: AWS and Coralogix spend per workshop stays small.

### Options scorecard (1 = worst, 5 = best)

| Decision area | Options (score) | Chosen |
|---|---|---|
| Fault injection | **Changesets**: a commit to the branch the lab cluster tracks, or a Terraform apply (5): same trail as a real incident, reviewable, reset by resetting the branch.<br>**Chaos operator** such as Chaos Mesh or Litmus (3): precise pod and network faults, but adds an operator and leaves a chaos resource no real incident has.<br>**In-app fault flags** (2): deterministic, but the "change" is a flag, not system behaviour.<br>**Imperative `kubectl`** by the facilitator (1): self-heal reverts it and it leaves no trail | **Changesets** |
| Environment | **Presenter's Mac on floci** (5 for a demo): no AWS account or cost, the same manifests, fully rehearsable; only one node, and AWS signals must be emulated.<br>**Dedicated short-lived `lab`** built from the same Terraform stacks and Argo CD manifests (5 for hands-on): real AWS signals.<br>**Retarget `dev`** to a workshop branch for the day (3): cheaper, but blocks `dev` and its promotion flow.<br>**One cluster per team** (2): cost multiplies by team count, plus provisioning effort.<br>**Replay only** (3): cheap and deterministic, but no live state and no remediation | **v1: the presenter's Mac** (owner's decision), with a recorded fallback; **v2: `lab`** |
| AWS signals locally | **Emulated, derived from real local signals and labelled** (owner's decision): AWS-shaped metrics and events move with the incident.<br>**None**: AWS stays a talk track.<br>**A separate real AWS segment**: credible, but needs an account and adds a second environment to the demo | **Emulated and labelled** |
| AI on stage | **Olly in the Slack alert thread, then the UI** (owner's decision).<br>**Claude Code with cx CLI and skills** on the same incident, side by side.<br>**Either alone** | **Both, side by side** |
| Database for the flagship | **PostgreSQL in-cluster with CloudNativePG**, managed by Argo CD (5): same on floci and AWS, Git trail, restarts in seconds, PgBouncer `Pooler` available as a fix.<br>**RDS PostgreSQL resized by Terraform** (3): AWS-native signals, but no effect on floci, and each instance-class change takes 10–30 min with downtime.<br>**Plain StatefulSet** (4): simpler, but no pooler and no managed roles | **CloudNativePG** in `lab`/`local`; the RDS resize stays as a later AWS variant (INC-10) |
| Scale-out trigger | **KEDA `ScaledObject`** on cms-backend with a span-metric p95 trigger (Prometheus scaler against the Coralogix PromQL API) plus CPU (5): literally autoscaling to tackle latency, which is a common anti-pattern when the latency comes from downstream.<br>**HPA on CPU** (2): an API waiting on its database burns no CPU, so the scaler would never fire.<br>**Manual scale** by the on-call engineer (3) | **KEDA latency + CPU**; Cluster Autoscaler adds nodes on AWS |
| Traffic | **Keep the browser load generator** (RUM, funnels) **and add k6** at a constant arrival rate against the API (5).<br>**More browser users** (2): CPU-heavy and still closed-model | **Browsers + k6** |

## Decision

1. **Catalog and delivery**: a catalog of incident scenarios (INC-0 to INC-8, plus a backlog).
   - **v1** is a presenter-led demo on `local` (floci on the presenter's Mac): INC-1, plus INC-4 and optionally INC-0. Every live run is recorded; a recording and the run's Coralogix time windows are the fallback.
   - **v2** is a hands-on workshop on a short-lived AWS environment, **`lab`**: EKS `cms-lab`, Terraform `envs/lab`, Argo CD tracking branch `lab/live`.
2. **Injection by changeset**: a scenario's trigger is one of:
   - a commit with a plausible diff, a persona author and a ticket-style message. On `local` it goes to the local Git mirror's branch `local`; on `lab`, to `lab/live`;
   - an AWS API change: a Terraform apply on `lab`, or the same API call against floci on `local`.

   **Reset** moves the branch back to its baseline and runs the scenario's data reset (rows, consumer offsets). Imperative actions exist only as scripted *stages* that demonstrate a lesson, such as the INC-1 "hotfix" that self-heal reverts.
3. **Coralogix first**: each scenario's root cause must be provable from Coralogix alone (**Tier 1**). That is also what Olly and Claude Code need. Read-only Argo CD, `kubectl` and AWS console access is **Tier 2**: confirmation only. ADR-024 decides the telemetry this needs.
4. **Workshop-only platform additions** are selected by the cluster label `workshop: "true"`, which is set only on `local` for the demo (`make local-all WORKSHOP=1`) and on `lab` in v2. They never appear in `dev` or `prod` overlays:
   - CloudNativePG operator and Cluster `cms-postgres`;
   - KEDA and `ScaledObject cms-backend`;
   - Cluster Autoscaler (`lab` only);
   - k6 traffic, a dataset seed Job, an OpenAI-compatible caption stub;
   - on `local`, the `aws-signal-emulator`.
5. **Prerequisites are not forked**: the workshop depends on ADR-020 phase 3:
   - 3.2: S3 media store;
   - 3.3: PostgreSQL provider, CMS side;
   - 3.5: multi-replica cms-backend;
   - the parallel-track fix for the title-null bug.

   These are built as the planned phase 3 work, not as workshop-only code.

   WP 3.5 must place its cms-backend HPA in the `dev`/`prod` overlays, not in `base`. KEDA rejects a `ScaledObject` whose target already has an HPA, and two HPAs on one Deployment fight each other.
6. **Method and skills**: the workshop ships a Coralogix-first investigation method and a set of skills that work both as human runbooks and as agent skills in the k8s-skills format. For cluster-state checks they hand off to k8s-skills by name instead of copying it.

7. **AI on stage**:
   - **Olly** is the primary investigator. The alert reaches a Slack channel through Coralogix notification routing, the presenter converses with Olly in the alert thread, the deep dive continues in the Coralogix UI, and Olly proposes the remediation.
   - **Claude Code** gets the same prompt and works with the cx CLI (query-only key), a view-only kubeconfig, read-only Argo CD and the workshop skills. It produces the fix as a commit, which the presenter applies.
8. **Emulated AWS signals on `local`**:
   - floci provides AWS APIs but no CloudWatch metrics or CloudTrail. An emulator derives AWS-shaped metrics from real local signals: node CPU, PostgreSQL I/O, Redpanda metrics. The demo tooling's own AWS API calls become CloudTrail-shaped change events, sent through ADR-025's ops-events sender.
   - Every series and event is labelled `cloud.emulated=true`, and the presenter says so up front.
   - On AWS (v2), the real CloudWatch Metric Streams and CloudTrail replace it.
## Implications

- **Positive**:
  - Incidents look and trace like real ones.
  - One mechanism serves live runs, rehearsal and CI self-tests.
  - The work doubles as the acceptance test for phase 3 and for the observability improvements; most of ADR-024 also benefits `dev` and `prod`.
  - The skills are reusable for real on-call work.
- **Negative / Risks**:
  - Hard dependency on phase 3 application work (S3, PostgreSQL, multi-replica API).
  - Three more add-ons to keep current (CloudNativePG, KEDA, Cluster Autoscaler), though only in `lab` and `local`.
  - KEDA's latency trigger depends on the Coralogix query API: an external dependency inside a control loop. A fallback replica count is mandatory.
  - A live demo can fail in front of a customer, and Olly's answers vary between runs. Mitigations: three dress rehearsals, a scripted set of prompt variants, and a recorded fallback.
  - Emulated AWS signals can look staged if they are not called out. They are derived from real signals and always labelled.
  - The Mac carries the whole stack plus Slack, a browser and Claude Code, so the demo profile reduces traffic (spike WS7).
  - Several clusters (the demo Mac, CI, later `lab`) can share one Coralogix team. Every alert, dashboard, query and KEDA trigger therefore filters on `k8s.cluster.name`; otherwise a nightly `local` self-test would scale `lab`.
  - If `lab` shares the `dev` AWS account, it reuses the once-per-account `global` stack (ECR, CI roles); it must not apply `global` itself.
  - Symptom timing depends on load calibration (the CPU "knee"); every scenario carries self-tests and calibration knobs.
  - The repository is public, so participants who look can see the scenario mechanics (open question WQ6).
  - Telemetry volume and Coralogix units grow during runs; traffic therefore runs only during sessions.
- **Follow-up actions**:
  - ADR-024.
  - [incident-workshop.md](../architecture/incident-workshop.md): architecture and delivery plan.
  - Component specs for the lab platform, scenarios, telemetry and playbooks.

## Consultation

- Working tree review: `deploy/`, `infra/terraform`, `backend/`, `loadgen/canvas-load`.
- The rendered Coralogix `otel-integration` 0.0.371 configuration for `dev`.
- The AWS EKS specs: ADR-017 to ADR-020 and the delivery plan.
- The k8s-skills repository: README, design notes, all 30 skills and the test rubrics, as of its last push on 2026-10-31.
