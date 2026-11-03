# Incident Detection and Investigation Demo (v1) and Workshop (v2)

**Status**: Proposed (2026-11-02; revised the same day after the owner's clarifications)  
**Decisions**: [ADR-023](../adr/ADR-023-incident-workshop.md) · [ADR-024](../adr/ADR-024-investigation-telemetry.md)  
**Components**:
- [workshop-lab-platform.md](../components/workshop-lab-platform.md): demo profile, baseline, injection and reset; `lab` for v2
- [workshop-scenarios.md](../components/workshop-scenarios.md): incident catalog, demo beats
- [workshop-telemetry-detection.md](../components/workshop-telemetry-detection.md): signals, emulated AWS, Slack/Olly, alerts
- [workshop-investigation-playbooks.md](../components/workshop-investigation-playbooks.md): run of show, Olly and Claude Code scripts, skills

**Builds on**: [aws-eks-platform.md](aws-eks-platform.md), [floci-local-environment.md](../components/floci-local-environment.md), [ADR-020](../adr/ADR-020-aws-data-services-mapping.md) phase 3  
**First customer run**: [incident-demo-scope-2026-11-03.md](incident-demo-scope-2026-11-03.md), the cut built for 2026-11-03

## 1. Purpose

**v1** is a **presenter-led live demo for Coralogix customers**, run from the presenter's Mac on floci. In 45–60 minutes it takes one flagship incident and one or two short ones from the first alert to the fix:

1. A change lands: a commit that Argo CD syncs, or an AWS API change made against floci.
2. A Coralogix alert reaches **Slack**.
3. The presenter asks **Olly** (Coralogix's AI agent) about it in the alert thread.
4. The investigation continues in the **Coralogix UI**, and Olly **proposes the fix**.
5. **Claude Code**, with the cx CLI and k8s-skills-style skills, investigates the same incident **side by side**.
6. The fix goes through Git; Argo CD syncs it; recovery shows up in Coralogix.

**Flagship (INC-1)**:
1. A "right-sizing" commit cuts the PostgreSQL CPU limit, and queries slow down.
2. API latency and errors rise in Coralogix APM (span metrics).
3. KEDA scales the API on that latency.
4. The extra replicas multiply connection pools past `max_connections`, turning a slowdown into an outage.
5. Optional beat: the on-call engineer's manual hotfix is reverted by Argo CD self-heal.

**v2 (deferred)** is the hands-on, multi-team workshop on a short-lived AWS `lab` (section 11). Everything v1 builds carries over.

### Goals

- A credible end-to-end flow across the layers customers run: Argo CD, Kubernetes, AWS (emulated signals, section 5), autoscaling, networking, data stores.
- **Coralogix first**: every root cause can be proven from Coralogix alone. Olly and Claude Code need exactly that to succeed.
- **Deterministic and rehearsable**: symptoms within minutes of injection, reset in ≤ 10 min between sessions, and a recorded fallback.
- **Honest**: emulated AWS signals are labelled on every chart and called out up front.
- **Reusable**: skills, scenarios and telemetry carry over to v2 and to real on-call work.

### Non-goals (v1)

- Hands-on participation (v2).
- Real CloudWatch metrics or CloudTrail: they are emulated locally (section 5).
- A Coralogix product training.
- Anything in `dev` or `prod`.

## 2. Audience and takeaways

**Audience**: customer engineering teams (SRE, platform, application), usually with their Coralogix champions.

| ID | Customers see… | Shown in |
|---|---|---|
| T1 | an alert in Slack turning into a root cause within minutes, through a conversation with Olly | all |
| T2 | change correlation across Git/Argo CD, configuration and AWS changes | INC-1, INC-4 (INC-0) |
| T3 | APM span metrics, traces, Kubernetes and database signals localising the bottleneck | INC-1 |
| T4 | an autoscaling feedback loop: KEDA scales on latency, causing a connection storm | INC-1 |
| T5 | GitOps-safe remediation: why the manual hotfix did not stick; the fix goes through Git | INC-1 |
| T6 | the same incident solved by Olly and by a coding agent with skills, and how they differ | INC-1 |
| T7 | what to instrument to get there: span-metric buckets, change events, DB and Kafka metrics | close |

The hands-on learning objectives LO1–LO8 apply to v2 (section 11).

## 3. Demo flow

```
 Presenter's Mac
 ┌──────────────────────────── floci on Docker Desktop ─────────────────────────────┐
 │ k3s cms-local: cms-demo app · CNPG cms-postgres · KEDA · Argo CD (+ notifications) │
 │ Coralogix agent + cluster collector · aws-signal-emulator (labelled "emulated")    │
 │ floci AWS APIs: SSM · Secrets Manager · IAM · S3 · MSK (Redpanda) · ECR            │
 │ local Git mirror (branch local) ◀── persona commits: make lab-inject / lab-fix     │
 └────────────┬──────────────────────────────────────────────────────────────────────┘
              │ OTLP, logs, metrics (k8s.cluster.name = cms-local)
              ▼
 Coralogix demo team ── alert ──▶ Slack #cms-demo-incidents ──▶ thread: presenter ⇄ Olly
   APM · Infrastructure · Explore · RUM · dashboards ◀──── "continue in Coralogix" (UI deep dive)
              ▲
              └──── Claude Code (terminal): cx CLI · kubectl (view-only) · argocd (read-only) · skills
```

**Screens**: Slack, Coralogix UI, a terminal with Claude Code, and optionally the Argo CD UI (port-forward).

**Beats per incident** ([scenarios spec](../components/workshop-scenarios.md#demo-selection-v1)):
1. inject during the narrative;
2. alert in Slack;
3. Olly thread;
4. UI deep dive;
5. Olly's fix proposal;
6. Claude Code side by side;
7. fix through Git;
8. recovery.

## 4. Environments

| | `local` demo (v1) | `lab` (v2, deferred) |
|---|---|---|
| Purpose | live customer demo, rehearsal, CI self-tests | hands-on workshop |
| Runtime | floci on the presenter's Mac (Docker Desktop, arm64), one k3s node | AWS: EKS `cms-lab`, 2–4× m7g.xlarge, Cluster Autoscaler |
| Cluster labels | `environment=local`, `workshop=true` (`make local-all WORKSHOP=1`) | `environment=lab`, `cloud=aws`, `workshop=true` |
| Git source | local Git mirror, branch `local`: persona commits on a recorded baseline; `make local-sync` is not run during a demo | GitHub branch `lab/live` |
| AWS signals | emulated from local signals, labelled (section 5) | real CloudWatch Metric Streams and CloudTrail |
| Scenarios | INC-0–6 and INC-8 (INC-8 needs `FLOCI_IAM_ENFORCEMENT=true`) | all, incl. INC-7 |
| Coralogix | the presenter's demo team | workshop team |

Every query, alert and KEDA trigger filters on `k8s.cluster.name`, so several clusters can share one Coralogix team safely.

## 5. AWS signals on a laptop (emulated)

floci emulates AWS **APIs** (SSM, Secrets Manager, IAM, S3, MSK via Redpanda, EKS via k3s) but produces **no CloudWatch metrics and no CloudTrail**. The owner chose to show AWS signals anyway, emulated:

- **Derived, not invented**: a small `aws-signal-emulator` (telemetry spec) turns real local signals into CloudWatch-shaped metrics and CloudTrail-shaped events. They move with the incident because their sources do:
  - node CPU → EC2 `CPUUtilization`;
  - PostgreSQL block reads and writes → EBS volume operations;
  - Redpanda's own metrics → MSK broker metrics;
  - the demo tooling's AWS API calls (`PutParameter`, `PutRolePolicy`) → CloudTrail-shaped change events, posted as Coralogix annotations through ADR-025's sender.
- **Labelled**:
  - every emulated series and event carries `cloud.emulated=true`;
  - the namespace label reads, for example, `AWS/EC2 (emulated)`;
  - dashboards titled "AWS (emulated on floci)";
  - the presenter says so in the first minute.
- **Same shape as the real thing**: names and dimensions match what Coralogix produces for real CloudWatch streams (spike WS13), so the same dashboards, alerts and questions to Olly work on AWS in v2.
- **Limits**: no load balancer, NAT or multi-AZ signals locally. INC-7 (AZ rebalance) stays v2.

## 6. Incidents

**Demo set** (default; WQ11):

| Slot | Incident | Why |
|---|---|---|
| main, ≈ 25 min | **INC-1** Right-sized into an outage | the reference case: DB right-sizing, KEDA feedback loop, connection storm, self-heal |
| second, ≈ 12 min | **INC-4** Green Argo, red app | AWS change (SSM `PutParameter` against floci, emulated CloudTrail) → ESO/Reloader → Kafka; Argo CD stays green |
| optional opener, ≈ 8 min | **INC-0** Release with a sharp edge | quick version comparison in APM; good when the customer is new to APM |

**Full catalog** (all specified in [workshop-scenarios.md](../components/workshop-scenarios.md)):

| ID | Title | Trigger (as delivered) | Primary layers | Demo-capable (local) | Prio |
|---|---|---|---|---|---|
| INC-0 | Release with a sharp edge | promotion commit: new cms-backend image with a tag-filter bug | Argo CD, APM (version compare) | yes | P0 |
| INC-1 | Right-sized into an outage | commit: PostgreSQL CPU limit 2 → 250m; stage: manual hotfix | Argo CD, K8s, scaling, PostgreSQL, APM, RUM | yes (flagship) | P0 |
| INC-2 | Hardening cut the pipeline | commit: NetworkPolicy tightening | networking, Kafka, Argo CD | yes | P1 |
| INC-3 | Retry storm at the edge | commit: Envoy timeout + retries policy | edge networking, APM, PostgreSQL | yes | P1 |
| INC-4 | Green Argo, red app | AWS API change: Kafka bootstrap parameter → TLS port | AWS (SSM), ESO/Reloader, Kafka, Argo CD | yes (demo second) | P0 for the demo |
| INC-5 | The bulk import | commit: one-off import Job (+150k rows) | data store, K8s OOM, APM | yes | P2 |
| INC-6 | Noisy neighbour | commit: browser load ×4 | K8s scheduling/QoS, EC2 CPU (emulated), APM | yes, all of the single node | P2 |
| INC-7 | AZ rebalance strands the whiteboard | Terraform: node subnets a/b → b/c | AWS EKS/EC2/EBS, scheduling | no: needs multiple AZs (v2) | v2 |
| INC-8 | Least privilege, most outage | AWS API change: IRSA S3 policy prefix | AWS IAM/IRSA, S3, APM | yes, with IAM enforcement | P2 |

**Backlog**:
- INC-9 lag snowball;
- INC-10 RDS right-sizing (v2, AWS);
- INC-11 telemetry blind spot.

## 7. Run of show

About 50 min; the detailed script is in the [playbooks](../components/workshop-investigation-playbooks.md#demo-run-of-show-v1).

| Time | Beat | Screen |
|---|---|---|
| 0:00 | Context: the system, what is instrumented, "AWS signals here are emulated". INC-1 is **injected now** (`make lab-inject INC=INC-1`); its symptoms build up during the talk | slides / Coralogix |
| 0:06 | INC-1 alert lands in Slack; Olly conversation in the thread (impact → what changed → why it got worse → fix) | Slack |
| 0:14 | Deep dive in Coralogix: APM and DB spans, throttling, KEDA replicas vs connections, change timeline, emulated EC2/EBS | Coralogix |
| 0:20 | Optional: Sam's hotfix (`make lab-stage STAGE=hotfix`) reverted by self-heal | Slack / Argo CD |
| 0:23 | Side by side: Claude Code with skills gets the same prompt; compare reasoning and evidence; it drafts the revert | terminal |
| 0:28 | Fix through Git (`make lab-fix INC=INC-1`, or apply Claude Code's commit); recovery in Coralogix | Coralogix |
| 0:32 | INC-4 (injected at 0:23): alert → Olly → emulated CloudTrail `PutParameter` → ESO/Reloader restarts → fix | Slack / Coralogix |
| 0:44 | Takeaways T1–T7, Q&A | slides |

Between sessions: `make lab-reset ENV=local` (≤ 10 min).

**Fallback**: a recording of the full run, plus the run's Coralogix time windows (the replay pack), refreshed after each rehearsal.

## 8. Safety and honesty

- **Claude Code**:
  - runs with a **view-only** kubeconfig (a ServiceAccount bound to `view`, because floci makes IAM principals cluster-admin, gap G5), a read-only Argo CD token, and a cx key with query scopes only;
  - the k8s-skills secret-guard hook blocks Secret reads;
  - it proposes the fix as a commit; the presenter applies it.
- **Coralogix data**: the presenter's demo team only; no customer data is used or shown.
- **AWS**: emulated signals are always labelled (section 5).
- **Personas**: fictitious people with `.invalid` e-mail addresses; nothing secret in changesets.
- **Isolation**: workshop components are selected only by `workshop=true`. Nothing reaches `dev` or `prod` (WF5 in CI).

## 9. Cost

| Item | v1 demo |
|---|---|
| AWS | none (floci on the Mac) |
| Coralogix | during sessions only, at a reduced demo profile (k6 at 15 rps, 4 browser users; final numbers from WS7): ≈ 90 spans/s → ≈ 0.3 M spans/h, plus RUM from 4 browsers. Traffic is set to 0 between sessions |
| Mac | Docker Desktop with 6 CPUs, ≈ 19.5 GiB RAM and ≥ 100 GB disk, as for floci today; the demo profile caps k3s at 6 vCPU and 12 GiB |

v2 `lab` cost is in section 11.

## 10. Delivery plan

### Prerequisites (owned by the AWS EKS plan, not forked)

| ID | Item | Source |
|---|---|---|
| P1 | S3 media store for cms-backend | ADR-020 phase 3.2 (WP 3.2) |
| P2 | `Database:Provider=postgres`, Npgsql, EF Core migrations for CMS (canvas stays on SQLite) | WP 3.3, CMS part |
| P3 | Multi-replica cms-backend, `RollingUpdate`. WP 3.5's HPA goes in the `dev`/`prod` overlays, not `base`: KEDA rejects a `ScaledObject` whose target already has an HPA | WP 3.5 |
| P4 | Fix for `MediaService.UpdateAsync` nulling `Title` (needed once captions succeed) | parallel track |
| P5 | .NET 10 for the backends (EOL of .NET 8/9 on 2026-11-10) | parallel track, recommended first |

### Phases (v1)

| Phase | Work | Exit criteria | Effort (eng-days) |
|---|---|---|---|
| W0 | Local spikes: WS1–WS7, WS10–WS13 | each passes or has an accepted fallback | 4–5 |
| W1 | Prerequisites P1–P4 (counted in phase 3) | CMS on PostgreSQL with 2+ replicas on `local` | (8–11) |
| W2 | Telemetry: ADR-024 items 1–4 | signal inventory "required" rows green on `local` | 5–7 |
| W3 | Demo platform on `local`: workshop components, caption stub, k6, seed, `aws-signal-emulator`, local Git flow, guardrails | WF1 baseline green on the Mac | 5–7 |
| W4 | Detection as code: alerts, SLOs, dashboards incl. "AWS (emulated)"; Slack routing | alerts quiet at baseline for 1 h; a test alert lands in Slack | 3–4 |
| W5 | Tooling (inject, stage, fix, reset, self-test, record); packs INC-1, INC-4, INC-0 | WF2–WF4 green for the three | 5–7 |
| W6 | Claude Code skills (core set), Olly prompt script, run of show, takeaway slides | WF7 and WF8 in rehearsal | 4–5 |
| W7 | Three dress rehearsals on the Mac, timing calibration, recorded fallback | full run ≤ 55 min twice in a row | 2–3 |

**v1 total**: ≈ 28–38 engineer-days, plus the prerequisites.

**Milestones**:
- **M1**: INC-1 end to end on the Mac, Slack → Olly → fix.
- **M2**: the full 50-min run with INC-4, side-by-side Claude Code, and the fallback recording.
- **M3**: v2 hands-on lab (section 11).

### Spikes

| ID | Question | Pass |
|---|---|---|
| WS1 | Does CloudNativePG run on floci k3s 1.37 (arm64)? Does a CPU-limit change roll the instance, with throttling visible in the cAdvisor CFS counters on k3s? Does `reserved_connections` + `pg_use_reserved_connections` keep the `otel_monitor` scrape working when ordinary connections are exhausted? | Cluster healthy; `container_cpu_cfs_throttled_periods_total` rises for `postgres`; PostgreSQL metrics keep flowing at `53300` |
| WS2 | Can the KEDA Prometheus scaler query Coralogix's PromQL API (EU1): endpoint, bearer auth, latency, rate limits, freshness (span-metric flush 30 s + ingestion)? Does fallback work on API errors? | the ScaledObject follows p95 within 2 min; fallback holds 2 replicas when the key is wrong |
| WS3 | Span-metric names, labels and APM percentiles after the bucket change; series count before and after | names and labels match the query cookbook; growth within the estimate |
| WS4 | Argo CD Notifications → OTLP/JSON → agent → Coralogix with commit metadata from the **local mirror**; field paths of Kubernetes events in Coralogix | a sync shows up in Coralogix with revision, persona author and message within 1 min |
| WS5 | Are the `postgresql` and `kafkametrics` receivers in the chart's collector image, and do they work against CNPG and Redpanda? | metrics flow on `local` |
| WS6 | Envoy Gateway 1.9: JSON access log with response flags, proxy metrics scrape, OTLP tracing to the agent, default route timeout | `UT`/`URX` flags and edge spans visible |
| WS7 | Demo profile on the Mac: calibrate the INC-1 knee (CPU limit vs rps), INC-4 timing and the reduced traffic; measure Coralogix units; check the Mac stays responsive with Slack, browser and Claude Code open | baseline and post-injection targets met; no Docker Desktop memory pressure |
| WS10 | Coralogix Terraform provider: metric- and log-based alerts, SLOs, dashboards, Slack routing | `terraform apply` creates A1, D1 and the Slack connector |
| WS11 | How a NetworkPolicy denial looks on k3s (its policy controller may reject rather than drop) vs the VPC CNI policy agent | INC-2's signature recorded per environment |
| WS12 | **Olly in Slack** for the demo team: invoking it in an alert thread; which data it can use (spans, metrics, logs, Kubernetes, change events, emulated AWS); deep links into the UI; whether and how it proposes remediation; answer latency | the INC-1 and INC-4 prompt scripts reach the root cause and a fix proposal in ≥ 2 of 3 rehearsal runs |
| WS13 | **Emulated AWS signals**: how Coralogix names real CloudWatch-stream metrics and CloudTrail logs (to copy the shape); could floci's request log later feed CloudTrail-shaped events for any AWS call; is Redpanda's `/public_metrics` reachable from k3s? | emulated EC2/EBS/MSK series and a `PutParameter` event queryable, shaped like the real integration and labelled `cloud.emulated=true` |

Spikes WS8 (AWS Metric Streams and CloudTrail) and WS9 (Cluster Autoscaler) move to v2.

### Fitness functions

They run with `make lab-selftest`; CI runs WF1–WF5 nightly on `local` and on pull requests labelled `e2e-lab`.

- **WF1 Baseline**: 15 min after reset, with traffic on:
  - API p95 ≤ 150 ms;
  - error ratio < 0.5 %;
  - Kafka lag < 20;
  - no P1/P2 alert firing;
  - all Argo CD Applications Synced/Healthy.
- **WF2 Signature**: after injection, every signature signal of the scenario crosses its threshold before its deadline, and the expected alerts fire (and land in Slack).
- **WF3 Reset**: `make lab-reset` returns to WF1 within 10 min with no leftover resources or data.
- **WF4 Provability**: every Tier 1 evidence query in the scenario's `queries.yaml` returns data for the run window.
- **WF5 Guardrails**: `dev`/`prod` renders contain no workshop kinds or labels; workshop ApplicationSets select only `workshop=true`.
- **WF6 Teardown** (v2): `make lab-down` leaves no AWS resources tagged `Environment=lab`.
- **WF7 Claude Code** (rehearsal): with the skills and read-only access, it names the root cause of INC-1 and INC-4 in ≥ 2 of 3 runs.
- **WF8 Olly** (rehearsal, manual): the prompt script reaches the root cause and a fix proposal in ≥ 2 of 3 runs (WS12).

## 11. v2: hands-on workshop (deferred)

Kept specified so v1 work is not redone later:

- **Environment**: the short-lived AWS `lab` ([platform spec](../components/workshop-lab-platform.md#v2-environment-lab-deferred)), with real CloudWatch Metric Streams and CloudTrail instead of emulation (telemetry spec), and Cluster Autoscaler. It adds INC-7.
- **Format**: 3–6 teams of 2–4 (Incident Commander, investigators, scribe).
  - Agendas: half day ≈ 4¼ h, full day ≈ 7 h.
  - Access tiers: Coralogix read-only for everyone; Tier 2 facilitator-mediated.
  - Scoring rubric, hint ladder, detection lab ([playbooks](../components/workshop-investigation-playbooks.md#v2-hands-on-facilitation-deferred)).
- **Learning objectives**:

  | ID | Participants can… |
  |---|---|
  | LO1 | triage from an alert or SLO burn |
  | LO2 | build a change timeline |
  | LO3 | localise with APM |
  | LO4 | tell throttling, contention, OOM and scheduling apart |
  | LO5 | recognise autoscaling feedback loops |
  | LO6 | follow the network path |
  | LO7 | investigate data-store saturation and lag |
  | LO8 | mitigate through Git and report blamelessly |

- **Cost**: ≈ USD 0.7–1.1/h while running (≈ USD 17–26/day): EKS, 2–4 nodes, MSK, NAT/NLB. About USD 40–70 per workshop, provisioned the day before.
- **Extra spikes**: WS8 (Metric Streams, CloudTrail), WS9 (Cluster Autoscaler).
- **Extra fitness function**: WF6.
- **Effort**: ≈ 12–18 engineer-days on top of v1.

## 12. Risks

| ID | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| RD1 | A live demo fails in front of a customer (Mac, Wi-Fi, Coralogix or Slack hiccup) | M / H | WF1 preflight 30 min before; recorded fallback and replay links; the hotspot is tested at the venue |
| RD2 | Olly answers differently each run, or a capability is not available for the demo team | M / H | WS12 before building the script; rehearsed prompt variants; the UI deep dive carries the story even if Olly is terse |
| RD3 | Emulated AWS signals look fake or misleading | M / M | derived from real signals, always labelled, called out up front; real streams in v2 |
| RD4 | Mac capacity: CNPG, KEDA, 6 API replicas, browsers, plus Slack, browser and Claude Code on the host | M / M | demo profile (WS7): fewer browsers, lower k6 rate, KEDA max 6, k3s caps |
| RW1 | Phase 3 prerequisites slip | M / H | W2–W3 proceed in parallel; P1–P3 prioritised as phase 3 work |
| RW2 | Symptoms are not deterministic (load knee, timing) | M / H | WS7 calibration, WF2 self-tests, per-scenario knobs, three dress rehearsals |
| RW3 | Coralogix API latency or limits destabilise the KEDA loop | M / M | WS2; fallback replicas; CPU trigger |
| RW10 | Upstream upgrades (chart, Envoy Gateway, KEDA, CNPG, floci) change the signals | M / M | pinned versions; WF2 before every demo |
| RW11 | Ingestion delay (span → metric → alert → Slack) adds minutes | M / L | measured in WS2/WS12; INC-1 is injected at the start of the talk |
| RW12 | Several clusters in one Coralogix team cross-talk (a nightly CI self-test pages the demo channel) | M / H | `k8s.cluster.name` filter everywhere; CI clusters use their own cluster name and no Slack routing |
| RW13 | SLO burn-rate alerts are slow by design | H / L | symptom threshold alerts A3/A4 page first |

## 13. Decisions and open questions

| ID | Topic | Status / default | Needed by |
|---|---|---|---|
| WQ1 | Audience | **decided**: Coralogix customers | — |
| WQ2 | Delivery | **decided**: presenter-led live demo on a local Mac (floci); hands-on is v2 | — |
| WQ3 | AWS account for `lab` | v2 | v2 |
| WQ4 | Coralogix team and Slack workspace for demos | open; default: the presenter's demo team on EU1 with its Slack integration and Olly enabled | W4 |
| WQ5 | Node autoscaler | v2 (single node locally) | v2 |
| WQ6 | Scenario packs and spoilers | low risk for a presenter-led demo; packs stay in this repo | — |
| WQ7 | Participant access | not applicable in v1 (presenter only) | v2 |
| WQ8 | AI | **decided**: Olly in Slack is the primary investigator; Claude Code with skills side by side | — |
| WQ9 | Phase 3 sequencing | open; default: the demo drives P1–P3 as phase 3 work, CMS side first | W1 |
| WQ10 | Alert channel | **decided**: Slack | — |
| WQ11 | Demo set beyond INC-1 | open; default: INC-4 second, INC-0 optional opener | W5 |
| WQ12 | Recorded fallback | default: yes, refreshed after each rehearsal | W7 |
| WQ13 | Olly capabilities available to the demo team | verify in WS12 | W0 |
| WQ14 | AWS signals | **decided**: emulated and labelled (section 5) | — |
