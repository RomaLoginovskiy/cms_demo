# Incident Demo: Scope for the First Customer Run (2026-11-03)

**Status**: Plan (2026-11-02)  
**Presenter**: Roman Loginovskiy  
**Design**: [incident-workshop.md](incident-workshop.md) (v1 demo); the incident is INC-1 in [workshop-scenarios.md](../components/workshop-scenarios.md#inc-1--right-sized-into-an-outage-flagship)  
**Coralogix objects**: [`workshop/demo/coralogix/`](../../workshop/demo/coralogix/)

The full v1 design takes weeks. This document fixes what is built **today** for **tomorrow's** customer demo, and what waits.

## 1. Goal and success criteria

A 45–60 min presenter-led live demo from the presenter's Mac (floci).

1. A FinOps commit downsizes the database.
2. API latency rises and a P1 alert reaches Slack `#production-alerts`.
3. The presenter investigates with Olly in the alert thread, then in the Coralogix UI.
4. An automatic on-call scale-out makes it worse.
5. Olly proposes the fix, and Claude Code reaches the same cause side by side.
6. The fix goes through Git, and recovery shows in Coralogix and Slack.

**Go / no-go** (rehearsal tonight, preflight tomorrow):

| # | Criterion |
|---|---|
| G1 | The alert fires within 6 min of the database commit and resolves within 8 min of the fix |
| G2 | Olly names the database change and the scale-out as causes in ≥ 2 of 3 rehearsal runs |
| G3 | Claude Code reaches the same cause, with evidence and a revert, in ≥ 2 of 3 runs |
| G4 | A full run fits 50 ± 5 min; reset takes ≤ 10 min |
| G5 | A screen recording of a full successful run exists (fallback) |

## 2. Scope

### In (tomorrow)

| Item | Notes |
|---|---|
| **INC-1 "Postgres-lite"** | plain Postgres StatefulSet `cms-postgres` (not CloudNativePG); cms-backend on Postgres with 2 replicas and a pool of 20 per pod; `max_connections=50` |
| **Automatic scale-out** | a watcher commits "scale cms-backend 2 → 8" as on-call persona Sam when p95 > 1 s twice in a row (timer fallback). This stands in for KEDA |
| **Persona commits** | Dana's FIN-142 and Sam's scale-out land in the local Git mirror with their names, so Argo CD history and Olly can show them |
| **Detection** | P1 APM alert → Notification Center → Slack `#production-alerts`; owning team `cms-platform`; dashboard linked in the description (section 4) |
| **Span-metric buckets** | add bounds above 200 ms (ADR-024 item 1), so APM and the dashboard show real p95 values during the incident |
| **Load** | k6 from the Mac at 40 req/s against `localhost:8080` (open model, in a container), plus the existing 10 browser users |
| **APM annotations** | each persona push sends a custom event at push time (commit author, subject, SHA) on `demo-cms-api` / `local`, and Argo CD Notifications sends the Deployment marker when the sync settles (ADR-025). On 2026-11-02 the ops-events key in `.secrets.env` returned **403**, so no marker had landed yet: a Send-Your-Data key with the OpsEvents preset is needed |
| **Emulated AWS metrics** | `aws-signal-emulator` in `observability` (local overlay of coralogix-otel): `AWS/EC2` CPUUtilization and StatusCheckFailed for `i-emulated-cms-local-1`, `AWS/EBS` ops, bytes, queue length and idle time for `vol-emulated-cms-local-root`, all `cloud_emulated="true"`. In INC-1 they show the instance is fine: the bottleneck is the pod's CPU limit (throttled, not contended) |
| **Claude Code side by side** | read-only identities, one investigation guide, one prompt |
| **Fix, reset, fallback** | revert both commits; reset script; screen recording |

### Out (later v1 or v2)

- CloudNativePG, KEDA on Coralogix p95, the hotfix/self-heal beat and the red-herring commit.
- INC-4, INC-0 and every other scenario.
- Real AWS (`lab`); emulated MSK, CloudTrail and the other AWS signals of later incidents.
- The S3 media store and other phase 3 work beyond the Postgres provider.
- PostgreSQL and Kafka receivers, the remaining alerts, SLOs and dashboards; detection as Terraform.
- Coralogix annotations (ADR-025): they help if the parallel session's work is live, but nothing depends on them.
- The scenario-pack format, CI self-tests and guardrails.

## 3. Scenario, end to end

**Starting state**:
- floci `cms-local` is up and sending data to the watcher team.
- cms-backend runs 2 replicas against `cms-postgres` (CPU limit 2, `max_connections=50`).
- k6 and the browsers run; p95 ≈ 50 ms; the alert is quiet.

| T | What happens | Visible in |
|---|---|---|
| −30 m | preflight (section 6) | — |
| 0 | inject: Dana Okafor, `chore(db): right-size cms-postgres to observed usage (FIN-142)`, CPU limit 2 → 60m (calibrated, W6) | local Git mirror → Argo CD |
| +1 m | Argo CD syncs; Postgres restarts (short burst of connection errors) | Kubernetes events, logs |
| +2–4 m | Postgres pinned at its CPU limit and throttled; DB spans slow; API p95 climbs from ≈ 50 ms to seconds | dashboard: DB p95, CPU, throttling |
| +4–6 m | P1 alert in `#production-alerts`, with the dashboard link. The presenter starts the Olly thread; Claude Code starts in parallel | Slack |
| +5–7 m | the watcher sees p95 > 1 s twice, then Sam's commit `ops: scale cms-backend 2 → 8 to absorb latency (INC-1103)` | Argo CD; dashboard replicas |
| +7–10 m | 8 pods × 20 connections > 50; `53300 too many clients`; the error ratio jumps; latency worsens | dashboard error ratio, logs |
| +10–22 m | Olly: impact → what changed (FIN-142, then Sam's scale-out) → why it got worse (connections) → fix. UI deep dive. Compare with Claude Code | Slack, Coralogix, terminal |
| +22 m | fix: revert both commits (Claude Code's revert or `lab-fix`); Argo CD syncs; recovery; "resolved" in Slack | Slack, dashboard |
| after | reset to the baseline | — |

Olly prompts: [Olly conversation script](../components/workshop-investigation-playbooks.md#olly-conversation-script), INC-1 rows; read "KEDA scaled" as "Sam scaled".

## 4. Coralogix objects (created 2026-11-02)

Team **watcher** (cx profile `default`, eu1). Definitions are in [`workshop/demo/coralogix/`](../../workshop/demo/coralogix/); [`apply.sh`](../../workshop/demo/coralogix/apply.sh) creates them in order, reuses existing objects by name, and wires the IDs together. All three were created on 2026-11-02; `apply.sh` prints their URLs. Re-running it reuses them by name.

| Object | Name | Key settings |
|---|---|---|
| Slack connector | `slack-production-alerts` | channel `production-alerts`, fallback `roman-internal`; reuses the Slack integration of `slack-roman-internal` |
| Dashboard | `cms-demo · API health (cms-local)` | 7 line charts: API p95, requests/s by route, error ratio, DB p95, cms-backend replicas, CPU cores (cms-backend, postgres), CPU throttling |
| Alert | `[cms-local] CMS API p95 latency > 150 ms` | Metric threshold, **P1**: p95 on a 2-min rate above 150 ms, held for 1 min (the API rejects free-form `dynamicDuration`; the window is the 1-minute enum); entity label `team=cms-platform` (also `service`, `cluster`, `workshop`); the description carries the owner and the dashboard URL; destination: the connector above with preset "Alerts - Basic Slack"; notifies on triggered and resolved; re-notifies every 10 min |

**Alert query** (APM span metrics):

```
histogram_quantile(0.95, sum by (le) (rate(duration_ms_bucket{service_name="demo-cms-api",
  k8s_cluster_name="cms-local", span_kind="SPAN_KIND_SERVER", span_name!~"GET /(healthz|ready)"}[2m])))
```

**Why 150 ms**: today's histogram bounds are 50/100/200 ms, so a p95 above 200 ms reads as exactly 200. A 150 ms threshold fires before the bucket fix lands, and after it, 150 ms is an exact bucket bound. Baseline p95 is ≈ 48 ms.

**Still to check**:
- The Coralogix Slack app must be a member of `#production-alerts`; otherwise messages go to the fallback channel `roman-internal`. Confirmed working on 2026-11-02; the channel is in the watcher team's own Slack workspace.
- Re-enable the cx-tam read-only guard (it was turned off for the create).

**Telemetry verified live on 2026-11-02** (names differ from the indicative cookbook in places):

| Signal | Metric (labels) | Baseline |
|---|---|---|
| API latency and rate | `duration_ms_bucket`, `calls_total` (`service_name`, `span_kind`, `span_name` such as `GET api/Media`, `status_code`, `k8s_cluster_name`) | p95 ≈ 48 ms; 11–100 req/s, mostly `GET api/Media/*/file` from the media worker replaying its topic |
| DB client spans | `db_duration_ms_bucket`, `db_calls_total` | p95 ≈ 48 ms |
| Container CPU | `container_cpu_utilization_1` (cores, despite the name; `k8s_container_name`, `k8s_pod_name`) | cms-backend ≈ 0.075 cores |
| CPU throttling | `container_cpu_cfs_throttled_periods_total_total` and `container_cpu_cfs_periods_total_total` (cAdvisor `namespace`, `pod`, `container`) | cms-backend ≈ 7 % |
| Replicas | `k8s_deployment_available__pod_`, `k8s_deployment_desired__pod_` | cms-backend 1 (2 after W5) |

## 5. Work breakdown (today)

| # | Task | Owner | Est. | Depends on | Done when |
|---|---|---|---|---|---|
| W1 | **Done 2026-11-02**: turn off the cx-tam guard, run `apply.sh`, re-enable the guard. Slack delivery confirmed (see status below) | Roman (guard), Claude (apply, verify) | 0.5 h | — | the three objects exist; the alert shows team label, link and destination |
| W2 | Span-metric buckets in the Coralogix chart values, published to the local mirror | Claude | 0.25 h | — | APM p95 can exceed 200 ms |
| W3 | Postgres provider in cms-backend, in an **isolated worktree from `HEAD`** (other sessions have uncommitted backend changes): Npgsql EF Core 9.x plus a provider switch next to the existing SQLite branch | Claude | 1.5 h | — | the API runs against a local Postgres |
| W4 | Build and push the cms-backend image from that worktree; retag the other five images | Claude (outside the sandbox) | 1 h | W3 | the new tag is pulled on `cms-local` |
| W5 | `cms-postgres` StatefulSet, Service, Secret and volume; cms-backend connection string, pool 20, 2 replicas | Claude | 1 h | W4 | WF1-style baseline: p95 < 150 ms for 15 min |
| W6 | k6 load from the Mac; calibrate the CPU limit for the commit (p95 > 1 s within 3 min of the cut, < 150 ms at 2 cores) | Claude + Roman | 1.5 h | W5 | knee found; numbers recorded here |
| W7 | Scripts: inject (persona commits to the local mirror plus refresh), watcher (auto scale-out by Sam), fix, reset | Claude | 2 h | W5 | a full cycle runs unattended |
| W8 | Claude Code: view-only kubeconfig (ServiceAccount plus read access to Argo CD Applications), cx query profile, investigation guide, prompt | Claude | 1.5 h | — | G3 in rehearsal |
| W9 | Rehearsal ×2, Olly prompt check, screen recording | Roman | 1.5 h | W1–W8 | G1–G5 |

≈ 10.5 h. Critical path: W3 → W4 → W5 → W6 → W7 → W9. W1, W2 and W8 run alongside.

**Status, 2026-11-02 evening** (runbook: [`workshop/demo/README.md`](../../workshop/demo/README.md)):

| # | State |
|---|---|
| W2 | Done. Bounds 5 ms … 30 s are live in Coralogix (`le` 5 … 30000) |
| W3, W4 | Done in the working tree (not a separate worktree): Npgsql provider plus a `Host=` switch; image built by `make local-all` after the floci rebuild |
| W5 | Done. Kustomize component `components/incident-postgres` in the local overlay: `cms-postgres` (postgres:16-alpine, trust auth, `max_connections=50`, CPU limit 2), cms-backend with pool 20 and 2 replicas. Seed: 300 text media (`seed.sh`); baseline tag `demo-baseline` |
| W6 | Calibrated (below) |
| W7 | Scripts in `workshop/demo/scripts/`: `inject`, `oncall` (Sam), `fix`, `reset`, `baseline`, `seed`, `load`, `watch`. `inject`, `fix` (recovery ≈ 50 s after the push) and `reset` (≈ 30 s) tested; full cycle with Sam: see rehearsal notes |
| W8 | Done: `investigator.sh` (ServiceAccount `demo-viewer`: view + Argo CD Applications, no Secrets; credential-free GitOps history), `investigator/CLAUDE.md`, `prompt.md`, permissions |
| W1 | Done. The P1 reaches Slack `#production-alerts` through Cases and the `cms-platform` router (confirmed by the presenter 2026-11-02). The channel lives in the watcher team's Slack workspace, not in the Coralogix corporate workspace that Claude's Slack connector reads, so delivery can only be checked by the presenter |

**W6 calibration** (k6 open model, search 60 % / filter 25 % / tags 15 %, plus the 10 browser users):

| Load | Postgres CPU at 2 cores | Cut to | Result |
|---|---|---|---|
| 25 req/s | ≈ 37m | 100m | no visible effect (probe ≤ 20 ms) |
| 25 req/s | ≈ 37m | 50m | instant outage: cold pools after the restart open ~40 connections, each pays catalog warm-up on a throttled CPU, connects time out at 15 s, Envoy returns 504; does not recover |
| 40 req/s | 55–73m | 70m | p95 113 ms to 6 s, unstable |
| 40 req/s | 55–73m | 60m, `pg_isready` probes | run 1: p95 8–9 s, P1 fired. Run 2: **outage** — the probes open a backend, time out on the starved CPU, the Service drops the endpoint and liveness heads for a restart |
| **40 req/s** | 55–73m | **60m, TCP probes** | **chosen**: p95 17 s during the restart burst, then 0.2–2.3 s; DB p95 0.2–1.7 s; Postgres throttled in 27–91 % of periods; errors ≈ 1 %. Degraded, not dead |

The knee is sharp because connection set-up costs CPU on the database: whatever opens many new connections at once (the Postgres restart, and later Sam's 6 new pods) pushes a throttled Postgres over the edge. That is the mechanism the scale-out beat shows. New cms-backend pods make it worse twice over: `EnsureCreated` at startup has Npgsql load the type catalog (a heavy query), which times out on the starved database and fails the pod, and each pod brings a pool of 20.

Probes on `cms-postgres` are `tcpSocket`, not `pg_isready`: exec probes that open a backend turned the slowdown into an outage (run 2 above). The scale-out watcher triggers on the P1 alert state (`cx alerts list`, two checks 30 s apart), so Sam visibly reacts to the page; the probe and a 420 s timer are fallbacks.

**Rehearsal, 2026-11-02 19:52–20:06 (scripts only; no Olly, no Claude Code)**:

| Time | Event | Signal |
|---|---|---|
| 19:51:58 | `inject.sh` (60m) | Argo CD syncs in < 30 s; Postgres restarts |
| 19:54 | API p95 21 s, errors 11–20 %; Postgres at 60m, 21–31 connections | Coralogix span metrics |
| 19:54:46 | Sam's commit 2 → 8 (t+168 s; probe trigger, the alert signal was stale from the previous run) | mirror, Argo CD |
| 19:56–19:59 | 7/8 pods ready; errors 22 → 52 %; successful req/s 32 → 27; 848 × `53300 too many clients already`, pool exhausted, read timeouts | logs, error ratio |
| 19:59:33 | `fix.sh` (one revert commit) | |
| 20:00:21 | API 16 ms; cms-backend 2/2 | |
| 20:06:12 | P1 resolved (6.5 min after the fix) | G1 ✓ |

Earlier run: P1 fired 2 min after the cut (G1 ✓). Reset ≈ 30 s, but the alert needs ≈ 6–8 min to resolve: wait for it before the next inject (`inject.sh` warns; Sam ignores a page that was already open). Open for G2/G3: Olly and Claude Code have not been run against the incident yet.

**Cut line if time runs short**, in order:
1. Drop the second rehearsal.
2. Shorten the Claude Code guide to the prompt only.
3. Run the scale-out on a fixed timer instead of the p95 watcher.

**Plan B**, if W3/W4 fail by mid-afternoon: the no-code variant. The commit cuts cms-backend's CPU (it embeds SQLite) and the scale-out causes SQLite lock contention. The alert, dashboard and Olly flow stay the same.

## 6. Preflight (tomorrow, T−30 min)

1. Docker Desktop and floci up; Argo CD Synced/Healthy; k6 and the browsers running.
   Node memory below ~10 GiB (`kubectl top node`): Sam's scale-out adds ~0.8 GiB and kubelet evicts near 12 GiB. vLLM (namespace `llm`) needs ~5 GiB even idle and does not fit beside the demo: keep it at 0 (`kubectl -n llm scale deploy/vllm --replicas=0`).
2. Dashboard: p95 < 150 ms for the last 15 min, error ratio 0, cms-backend 2/2, Postgres CPU well below its limit.
3. The alert is enabled and OK; the Slack channel is open; Olly answers a trivial question in a thread.
   Annotations: the preflight check in `workshop/demo/README.md` prints `annotation sent (2xx)`, not 403.
4. Claude Code: `cx` query, `kubectl get pods -n cms-demo` and the Argo CD application read all work with the read-only identities.
5. The local mirror sits at its baseline tag, and `make local-sync` will not run during the demo.
6. The recording and the dashboard and alert links are at hand.

## 7. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Alert late (span metrics flush 30 s plus ingestion plus the 2-min condition) | narrate from the dashboard; inject during the intro |
| Olly drifts or omits the change | backup prompts in the Olly script; show the Argo CD history |
| Claude Code stalls | show the rehearsal transcript |
| The Postgres knee shifts with laptop load | WS7-style calibration tonight; the inject script takes the limit as a parameter |
| A parallel session publishes a working-tree snapshot during the demo | coordinate; the baseline tag plus reset restores the state |
| The Mac or the network fails | the recording |
| No Slack message | Delivery confirmed on 2026-11-02 (Cases → router `cms-platform` → `#production-alerts` in the watcher team's Slack workspace). In preflight, check that the last rehearsal's page and its "resolved" arrived; if not, narrate from the Coralogix alert and Cases view |

## 8. Decisions taken on 2026-11-02

| Topic | Decision |
|---|---|
| Audience, format | Coralogix customers; presenter-led demo on a local Mac; 45–60 min |
| Flow | Slack thread with Olly → Coralogix UI → Olly proposes the fix |
| AI | Claude Code side by side with Olly (must have) |
| Database | Postgres-lite tomorrow (plain StatefulSet); CloudNativePG later |
| Scale-out | an automatic Git commit by on-call persona Sam, fired by the scenario; KEDA later |
| App scope | minimal: Postgres provider plus replicas on the single node; S3 later |
| Coralogix team | the existing watcher team; Olly is already in its Slack |
| Alert | P1; owning team `cms-platform`; p95 > 150 ms over 2 min; routed to `#production-alerts` through Notification Center; dashboard link in the description |
| AWS signals | emulated EC2 and EBS metrics added on 2026-11-02 evening at the presenter's request (`aws-signal-emulator`, dashboard row "AWS (emulated on floci)"); MSK and CloudTrail later |

## 9. Spec sections used tomorrow

| Purpose | Section |
|---|---|
| Flow and run of show | [Demo flow](incident-workshop.md#3-demo-flow), [Run of show](incident-workshop.md#7-run-of-show) |
| Answer key | [INC-1 beats](../components/workshop-scenarios.md#inc-1-beats--25-min), [INC-1](../components/workshop-scenarios.md#inc-1--right-sized-into-an-outage-flagship) |
| Demo plumbing | [Git flow on the local mirror](../components/workshop-lab-platform.md#git-flow-on-the-local-mirror), [Slack, Olly and Claude Code](../components/workshop-lab-platform.md#slack-olly-and-claude-code) |
| Scripts | [Olly script](../components/workshop-investigation-playbooks.md#olly-conversation-script), [Claude Code side by side](../components/workshop-investigation-playbooks.md#claude-code-side-by-side), [Fallbacks](../components/workshop-investigation-playbooks.md#fallbacks) |
