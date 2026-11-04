# Component: Incident Scenarios (Demo and Workshop)

**Status**: Proposed (2026-11-02)  
**Decisions**: [ADR-023](../adr/ADR-023-incident-workshop.md)  
**Related**:
- [workshop-lab-platform.md](workshop-lab-platform.md): baseline, pack format, injection and reset
- [workshop-telemetry-detection.md](workshop-telemetry-detection.md): alerts `A*`, queries
- [workshop-investigation-playbooks.md](workshop-investigation-playbooks.md): method and rubric

The catalog of incidents. Each entry is the contract for one scenario pack under `workshop/scenarios/`:

- the trigger as participants would find it in history;
- the causal chain the self-test checks;
- the Tier 1 evidence that proves the cause;
- the answer key: cause, wrong answers, mitigation.

Times are relative to **T0**, the moment the trigger is pushed or applied.

- Commits reach the cluster within the Argo CD reconciliation (≤ 180 s; the injector's refresh usually makes it < 30 s).
- Span metrics add about 30 s of flush plus ingestion delay (measured in WS2).

## Shared baseline

What WF1 checks before every scenario. These are initial targets; WS7 sets the final numbers.

| Signal | Baseline |
|---|---|
| Traffic | k6 30 rps open model + 0.2 rps upload flow + 1 rps canvas; 10 browser users (CMS funnels). **Demo profile (Mac)**: k6 15 rps, 4 browsers. WS7 recalibrates the knobs for it (for example INC-1's reduced CPU limit) so that every signature below still holds |
| `demo-cms-api` server p95 / error ratio | ≤ 150 ms / < 0.5 % |
| `GET /api/media` (20k rows) p50 | 300–700 ms (INC-3, INC-5 depend on it) |
| `cms-postgres` CPU | 0.5–0.8 cores of a 2-core limit: at least 2× the INC-1 limit, below 40 % of the baseline limit |
| PostgreSQL connections | ≤ 40 of 100 (2 pods × pool 20) |
| cms-backend replicas | 2 (KEDA min) |
| Kafka lag, group `demo-cms-media-worker` | < 20 (caption stub at 300 ms) |
| Argo CD | all Applications Synced/Healthy |
| Alerts | none at P1/P2 |

Every query below implicitly filters on the scenario's cluster (`k8s.cluster.name` = `cms-local` or `cms-lab`).

**Alert timing**:
- Symptom threshold alerts (A3 edge 5xx, A4 journey failures) are the first pages, a few minutes after users feel the impact.
- SLO burn alerts (A1, A2) need their long window (30 min in `lab`) to fill, so they follow 10–20 min later, or not at all for small error shares.

That difference is a debrief point, not a defect.

## Personas

Commit authors are fictitious and use `.invalid` addresses. They make the history read like a real team's:

| Persona | Role | Used in |
|---|---|---|
| `cms-release-bot` | promotion GitHub App | INC-0 |
| Dana Okafor | FinOps | INC-1 |
| Ravi Shah | Observability | INC-1 (red herring) |
| Lee Novak | Security | INC-2, INC-8 |
| Marco Ruiz | Performance | INC-3 |
| Aiko Tanaka | Platform | INC-4, INC-7 |
| Sofia Marin | Content operations | INC-5 |
| Tom Weber | QA | INC-6 |
| Sam (on-call) | the on-call engineer | INC-1 stage |

## Demo selection (v1)

The live demo ([run of show](workshop-investigation-playbooks.md#demo-run-of-show-v1)) uses **INC-1** as the main incident, **INC-4** as the second and **INC-0** as an optional opener. All three run on `local`.

The Olly answers below are the **expected content**, not guaranteed wording. WS12 validates the prompts, and WF8 requires the root cause and a fix proposal in ≥ 2 of 3 rehearsals. Exact prompts live in `workshop/demo/olly-prompts.md` and `claude-prompts.md`.

### INC-1 beats (≈ 25 min)

| Beat | Audience sees | Presenter does |
|---|---|---|
| Before the talk | the red herring (Ravi's RUM sampling commit) already in history | `make lab-inject INC=INC-1` runs the −10 m change at preflight, then waits |
| 0:00 | intro; the FIN-142 commit (Dana) lands; the cascade builds during the intro | the trigger step of `lab-inject` |
| ≈ +6 m | Slack: A3 "edge 5xx" with deep links, then A4/A5/A7 in the channel | — |
| Olly 1 | "What is going on, and who is affected?" → `demo-cms-api` errors and latency on the media routes since ≈ T+4 m; CMS journeys failing | asks in the alert thread |
| Olly 2 | "What changed shortly before it started?" → the Argo CD sync of FIN-142 on `cms-postgres` (author Dana, message); the earlier frontend change is unrelated | — |
| Olly 3 | "Why did it get worse after a few minutes?" → KEDA scaled cms-backend 2 → 10 on latency; PostgreSQL connections at the ceiling; `53300` errors | — |
| UI | APM: `demo-cms-api` → DB calls slow; Kubernetes: `postgres` CPU flat at the 0.25 limit and throttled; D2 change timeline with annotations; D3 connections vs replicas; "AWS (emulated)" panel: EC2 CPU, EBS ops | follows Olly's links |
| Hotfix (optional) | Sam patches the CPU limit, Argo CD reverts it within seconds, another error blip. Olly: "Why didn't Sam's fix stick?" → self-heal restored the Git state | `make lab-stage INC=INC-1 STAGE=hotfix` |
| Olly 4 | "What should we do?" → stop the amplification (pause KEDA or cap replicas), revert FIN-142; later: pooler and connection budget | — |
| Claude Code | the same incident from one prompt. Its path through the skills: triage → change timeline → PostgreSQL saturation → autoscaling loops → GitOps mitigation. It ends with the cause sentence, the evidence, and a revert commit with `# Undo:` | terminal, side by side; compare evidence and reasoning |
| Fix | the revert (Claude's commit or `make lab-fix INC=INC-1`) → Argo CD sync → CNPG restart | — |
| Recovery | p95 < 150 ms, connections ≤ 40, alerts resolve in Slack; KEDA scales down after 5 min | D1/D3 |

### INC-4 beats (≈ 12 min)

| Beat | Audience sees | Presenter does |
|---|---|---|
| Inject (during the Claude Code segment) | — | `make lab-inject INC=INC-4`. The tool calls `aws ssm put-parameter` against floci **as IAM user `aiko.tanaka`** (created in floci for the demo), so the emulated CloudTrail event names her |
| ≈ +6 m | Slack: A4 "upload action failing", A11 "Kafka producer errors" | — |
| Olly 1 | "Uploads fail but nothing was deployed today. What changed?" → no Argo CD sync; cms-backend and media-worker restarted by Reloader after ExternalSecret `app-endpoints` updated; producer errors name `:9094` | asks in the thread |
| Olly 2 | "Who changed it?" → the emulated CloudTrail `PutParameter` on `/cms-demo/local/kafka/bootstrap_brokers` by `aiko.tanaka` at T0 | — |
| UI | route-level RED: only `POST /api/media` fails; librdkafka logs; kube events (rollout without a sync); emulated MSK brokers healthy | follows links |
| Fix | Olly: restore the parameter; follow-up: the TLS client change first (WP 3.1) | `make lab-fix INC=INC-4` restores the value as the presenter; ESO and Reloader roll back |

### INC-0 beats (optional opener, ≈ 8 min)

- **Detect**: A3 in Slack.
- **Olly**: "What changed?" → the promotion of `sha-<12>` (CMS-231); errors only on `GET /api/media/filter` and only on the new `service.version`.
- **UI**: APM version comparison.
- **Fix**: revert the promotion (`make lab-fix INC=INC-0`).

---

## INC-0 — Release with a sharp edge (warm-up)

**Prompt**: "Editors say filtering the media library by some tags shows an error. Everything else seems fine."

**Trigger**:
- A promotion commit by `cms-release-bot`: `deploy(lab): cms-backend sha-<12> — tag filter normalisation (CMS-231)`.
- It changes the cms-backend `newTag` in `overlays/lab/kustomization.yaml` and `APP_VERSION` in `patches/build-info.yaml`, exactly what promote-dev does.
- The image is built from branch `lab/inc-0-release`: one commit that normalises multi-word tags and throws (`InvalidOperationException`) for hyphenated tags.
- On `local` the injector sets a per-image tag override, `image_tag_override.cms-backend`, which the `cms-demo` ApplicationSet must honour (small extension). Today one `image_tag_override` covers all six images, so a single-service release would restart every workload and blur the signal.
- Baseline prerequisites, so the bug has victims:
  - the workshop loadgen config adds hyphenated tags (`black-friday`, `year-end`) to `profiles.cms.tag_vocabulary`, so browser curators filter by them too;
  - about 25 % of seeded tags are hyphenated.

**Causal chain**:

| T | What happens |
|---|---|
| +0–3 m | Argo CD syncs; the cms-backend rolling update replaces both pods |
| +3 m | `GET /api/media/filter` fails for about 25 % of requests (those with hyphenated tags), only on the new version: ≈ 11 % of all API calls |
| +5–7 m | A3 (edge 5xx > 2 %) and A4 (the curators' `filter` action fails) fire; RUM shows errors on the filter step of the `cms_curator` funnel |
| +20 m or never | A2 (availability burn): ≈ 11 % errors fill the 30-min window slowly. Debrief point: burn alerts are tuned for budget, not speed |

**Tier 1 evidence**:
1. APM, service `demo-cms-api`: errors only on `GET /api/media/filter`, only for the new `service.version`. The version comparison shows the old version clean.
2. Error spans carry the exception type, message and stack (`RecordException = true`).
3. Change timeline: Argo CD sync to the promotion commit; kube events `ScalingReplicaSet` at the same minute.
4. Database, Kafka and node metrics are flat.

**Root cause**: "Release `sha-<12>` (CMS-231) changed tag normalisation in `GET /api/media/filter`, which throws for hyphenated tags; Argo CD rolled it out at T+n."

**Wrong answers**: database or Kafka trouble; infrastructure; rolling back the frontend.

**Mitigation**:
- Immediate: revert the promotion commit (previous tag).
- Follow-ups:
  - progressive delivery with automated analysis on span metrics;
  - a test case with hyphenated tags;
  - an alert on per-version error ratio.

**Reset**: branch reset.

**Variants**:
- **b**: an N+1 query in `GET /api/media/{id}` raises p95 only on the new version (a latency regression instead of errors).

---

## INC-1 — Right-sized into an outage (flagship)

**Prompt**: "Support has two tickets: the media library is slow and sometimes fails to load. Several alerts fired in the last few minutes."

**Changes**:

| T | Author | Commit | Diff |
|---|---|---|---|
| −10 m | Ravi Shah | `chore(rum): sample 100% of cms-frontend sessions for the review (OBS-9)` | cms-frontend env (sampling flags) → rollout of the frontend (**red herring**) |
| 0 | Dana Okafor | `chore(db): right-size cms-postgres to observed usage (FIN-142)`, body: "p95 CPU over 14 days was 0.21 cores. Limit 2 → 250m, request 1 → 250m." | `components/workshop/postgres/cluster.yaml` `resources` |

The 0.21 cores in the message is real. It is the usage of the **standby** instance, which serves no traffic: a debrief detail about evidence-free right-sizing.

**Stage** `hotfix` at about +15 m:
- Sam (on-call), as `oncall-sam`, patches the CNPG Cluster limit back to `cpu: 2`.
- Self-heal reverts the patch within seconds, and CNPG starts another rolling update.
- Announcement: "I bumped the database CPU by hand. Should be fine now."

**Causal chain** (`lab`; `local` differs where noted):

| T | Layer | What happens | Signal |
|---|---|---|---|
| +0–3 m | Argo CD | sync of FIN-142 | change event (author Dana); `OperationCompleted` kube event |
| +1–4 m | CNPG | rolling update: standby first, then switchover/restart of the primary | burst of `57P01`/connection-refused errors (≈ 10–30 s) |
| +3–6 m | PostgreSQL | primary CPU flat at 0.25 cores; CFS throttled ratio > 50 % | `db_throttle_ratio`, A6 |
| +4–7 m | APM | p95 of `GET /api/media*` rises from ≈ 150 ms to > 1 s; DB span durations rise 10–30×; the first pool and route timeouts reach the edge | `api_p95_ms`; DB span metrics; A3 |
| +5–8 m | KEDA | the latency trigger returns ⌈p95 ÷ 300 ms⌉; HPA doubles at most every 30 s: 2 → 4 → 8 → 10 | `SuccessfulRescale` events; `cms_backend_replicas`; A7 |
| +6–10 m | AWS (`lab`) | new pods Pending (5 vCPU of requests) → Cluster Autoscaler `TriggeredScaleUp` → node 3 (and 4) in 2–4 min | `pods_pending`; EC2/ASG metrics |
| +6–10 m | `local` | Pending pods stay Pending (single node): an extra symptom and a temptation to "add capacity" | `pods_pending`, A8 |
| +8–12 m | PostgreSQL | up to 10 pods × pool 20 exhaust the 94 connections open to ordinary roles (`max_connections` 100 minus superuser and `reserved_connections` slots); `53300 sorry, too many clients already`; more backends competing for 0.25 cores push latency up again. `otel_monitor` keeps scraping through a reserved slot | `db_connection_ratio` ≥ 0.9, A5; error spans and logs with `53300` |
| +8–12 m | Users | API error ratio 20–50 %; RUM errors and slow page loads; loadgen journeys fail | A3, A4 |
| +15–22 m | SLO | the burn alerts' long windows fill | A1, A2 |
| +15 m | Argo CD | hotfix reverted by self-heal; a second CNPG rolling update causes another error burst | automated sync to the same revision seconds after a live edit |

**Tier 1 evidence** (`queries.yaml`):
1. `api_p95_ms` and `route_error_ratio` step up at +4 m. The service map and DB span metrics put the time in `postgresql` spans.
2. `db_cpu_usage_cores` is pinned at `db_cpu_limit_cores` (0.25), and `db_throttle_ratio` > 0.5, from the minute after the sync.
3. Change timeline:
   - FIN-142 synced at +n;
   - the frontend change at −10 m, whose rollout causes no API errors (ruled out);
   - KEDA/HPA rescale events after the latency rise;
   - the self-heal sync after the hotfix.
4. `db_connection_ratio` climbs to its ceiling (≈ 0.95) only **after** the scale-out, and `53300` errors start then. Connection-budget arithmetic: 10 × 20 = 200 > 94.
5. The CNPG restart burst (`57P01`) lines up with the sync.

**Root cause**: "FIN-142 cut the cms-postgres CPU limit from 2 to 0.25 cores. Under normal load the primary was throttled, and query and API latency rose 10–30×. KEDA scaled cms-backend on that latency to 10 replicas, whose pools (20 each) exceeded `max_connections` (100), turning the slowdown into a connection-refusal outage."

**Contributing factors**:
- KEDA scales on end-to-end latency that is bound by a downstream resource.
- There is no connection budget or pooler.
- The right-sizing was based on the standby's usage, with no review of limits.
- Manual hotfixes fight GitOps.

**Wrong answers**:
- the frontend change (red herring);
- Kafka;
- node capacity as the cause ("add nodes"; Pending pods are a consequence);
- a Coralogix or agent problem;
- "raise `max_connections`" offered as the fix.

**Mitigation**, in order of value:
1. **Stop amplification**: pause KEDA via Git (`autoscaling.keda.sh/paused-replicas: "2"` on the ScaledObject).
2. **Revert FIN-142** via a pull request.
3. Verify: throttling gone, p95 < 150 ms, connections ≤ 40, alerts resolve.

Accepted alternative: revert alone, accepting slower recovery.

**Follow-ups**:
- a PgBouncer `Pooler` (transaction mode) with a connection budget (replicas × pool ≤ pooler capacity);
- scale on per-pod saturation, not end-to-end latency;
- alerts on DB throttling;
- right-sizing that needs peak and limit analysis;
- load shedding at the edge.

**Reset**: branch reset; `reset.sh` removes any pause annotation and waits for CNPG healthy and replicas back to 2.

**Variants**:

| Variant | Change | Effect |
|---|---|---|
| **b** | `max_connections` 100 → 40 ("save memory per connection") | exhaustion at the first scale step |

**On `local`**: the trigger uses `changes/10-trigger.local.patch`, which also lowers the request in `workshop-sizing-local`; otherwise the request would exceed the new 250m limit and be rejected. A memory/`shared_buffers` variant was dropped: with 20k rows the working set stays in the page cache, so it would produce no EBS signal.

---

## INC-2 — Hardening cut the pipeline

**Prompt** (support persona, customer-reported): "Since about an hour ago, newly uploaded images have no descriptions. Uploads work. No alert fired."

This scenario is a **detection gap by design**: alert A14 does not exist at baseline.

**Trigger**:
- Lee Novak: `sec: replace blanket intra-namespace allow with explicit service policies (SEC-311)`, in `deploy/apps/cms-demo/base/network-policies/policies.yaml`.
- It removes `allow-same-namespace` and adds per-service allows for every existing path **except** media-worker → cms-backend:8080.
- The self-test proves that only this path breaks.

**Causal chain**:

| T | What happens | Signal |
|---|---|---|
| +0–3 m | NetworkPolicies synced; no pod restarts | change event lists `NetworkPolicy` resources; no rollout events |
| +3 m | the worker's file fetch `GET http://cms-backend:8080/api/media/{id}/file` is silently dropped; HttpClient times out after 30 s | worker client spans ≈ 30,000 ms with errors; log "Failed to load image" |
| +3 m → | the worker skips without committing; committed offset stuck; lag grows with every upload (≈ 12–15/min) | `kafka_lag` rising |
| +3 m → | cms-backend **never sees** those requests; user traffic unaffected | no matching server spans (absence) |

**Environments**:
- On `lab`, the VPC CNI policy agent drops denied packets, giving the 30 s timeouts above.
- k3s' policy controller may reject instead, giving fast failures on `local`. WS11 records the real signature per environment, and the rubric accepts either.

**Tier 1 evidence**:
1. Worker client spans: timeouts only towards `cms-backend`; the caption stub receives no calls.
2. `kafka_lag` for `demo-cms-media-worker` rises from +3 m while the consumer group still has 1 member and the brokers are up.
3. Change timeline: the SEC-311 sync with NetworkPolicy resources, and no rollout.
4. On `lab`: timeouts, not refusals and not DNS errors, so the packet is dropped. On `local`, see WS11.

**Root cause**: "SEC-311 replaced the namespace-wide allow with per-service policies that omit media-worker → cms-backend. The worker's file fetches are dropped and time out, no offsets are committed, so captions stopped and lag grows."

**Wrong answers**:
- a Kafka broker problem;
- a slow captioning service;
- cms-backend down;
- DNS.

**Mitigation**: add the missing allow, or revert, via Git. Then **repair the data**:
- Kafka commits are positional, so the first successful commit after the fix skips every failed message.
- Stop the worker through Git (`replicas: 0`): offsets can only be reset for an inactive group.
- Reset the group's offsets to T0 (`kafka-consumer-groups --reset-offsets --to-datetime <T0> --execute`, run by the facilitator).
- Restore the worker so it replays the window.

**Detection lab** (15 min): teams create A14 (consumer lag) and a worker error-ratio alert in the participants folder; the facilitator replays the window to show both would have fired.

**Follow-ups**:
- retry topic or DLQ instead of skip-without-commit;
- a policy test in CI that renders the policies and checks the required paths.

**Reset**: `reset.sh` stops the worker and resets the offsets `--to-latest`, then the branch reset restores everything.

**Variants**:

| Variant | Change | Effect |
|---|---|---|
| **b** | egress default-deny on the worker without a DNS allowance | DNS lookups time out after a few seconds (`Resource temporarily unavailable` / `Temporary failure in name resolution`): a third signature, between a refusal and a 30 s TCP timeout |
| **c** | worker egress to Kafka blocked | fetch errors, consumer group loses its member |

---

## INC-3 — Retry storm at the edge

**Prompt**: "Users intermittently get 'Gateway Timeout' when they open the media library. API dashboards look mostly fine."

**Trigger**:
- Marco Ruiz: `perf(edge): fail fast and retry transient API errors (PERF-88)`.
- Adds `BackendTrafficPolicy cms-backend-resilience` on HTTPRoute `cms-backend`:
  - request timeout 2 s;
  - 3 retries with a per-try timeout of 400 ms and 50 ms back-off, on `5xx`, `reset` and `connect-failure`.
- Exact Envoy Gateway field names are confirmed in WS6.

**Causal chain**:

| T | What happens | Signal |
|---|---|---|
| +0–3 m | Envoy config updated (no restarts) | change event (`BackendTrafficPolicy`) |
| +3 m | `GET /api/media` (300–700 ms) exceeds the 400 ms per-try timeout → `UT` → retried ×3 → 504 to the client | access logs `504`, flags `UT`/`URX`, attempt count 4 |
| +3 m → | the API runs every abandoned attempt to completion (no cancellation token reaches EF Core) → 4× load on that route and on PostgreSQL | server request rate for the route ≈ 4× the client rate (k6 / RUM) |
| +5–10 m | DB CPU and API CPU rise → other routes slow down past 400 ms → they are retried too → storm; KEDA's CPU trigger adds API pods; the DB stays the bottleneck | `edge_retry_rate`; `api_p95_ms` rising moderately; A3, A4, later A1 |

**Tier 1 evidence**:
1. Edge vs server: Envoy 504s with `UT`/`URX`, while server spans for the same route are mostly `200` at 300–700 ms. The server "succeeded" and the client failed.
2. Request-rate mismatch: server ≈ 4× client for `GET /api/media`.
3. The change event for the new policy at +n, with no app or DB change.
4. DB load rising as a consequence (`db_cpu_usage_cores`), not as a trigger.

**Root cause**: "PERF-88 set a 400 ms per-try timeout with 3 retries at the edge. `GET /api/media` normally takes 300–700 ms, so Envoy abandons and retries it while the API completes every attempt, multiplying load ×4 and pushing other routes past the timeout."

**Wrong answers**:
- the database (it is saturated, but only as a consequence);
- "scale the API";
- Envoy pods overloaded.

**Mitigation**: revert the policy.

**Follow-ups**:
- timeouts derived from the latency SLO (p99.9 plus margin);
- retries only for idempotent requests, only on connect failures, with a retry budget;
- pass the request's cancellation token into EF Core queries: `GetAll` takes none, while the newer `GET /api/media/search` already does;
- move the library page to the paged `search` endpoint.

**Reset**: branch reset.

**Variants**:

| Variant | Change | Effect |
|---|---|---|
| **b** | 500 ms timeout, no retries | plain 504s, no amplification |
| **c** | retries on 503 without a circuit breaker during a CNPG switchover | storm on recovery |

---

## INC-4 — Green Argo, red app

**Prompt**: "Uploads spin and then fail; browsing works. Argo CD is all green and nobody deployed today."

**Trigger**:

| Variant | Where | Change |
|---|---|---|
| **a** (`lab`) | Terraform change by Aiko Tanaka on `lab/live`, applied by the facilitator (`make tf ENV=lab STACK=infra CMD=apply`) | `feat(kafka): move clients to the TLS listener (SEC-290)`: `stacks/infra` publishes `module.msk.bootstrap_brokers_tls` (port 9094) to `/cms-demo/<env>/kafka/bootstrap_brokers` |
| **b** (`local`, the demo default; optional on `lab`) | "console change" by floci IAM user `aiko.tanaka` | `aws ssm put-parameter --overwrite` with port 9094; emulated CloudTrail event on `local` |

The workshop component sets `refreshInterval: 1m` on ExternalSecret `app-endpoints`, so propagation fits the timebox.

**Causal chain**:

| T | What happens | Signal |
|---|---|---|
| +0 | SSM parameter changes | Terraform apply event / CloudTrail `PutParameter` (`lab`) |
| +1–2 m | ESO updates Secret `app-endpoints`; Reloader rolls cms-backend and media-worker | kube events: rollout **without** an Argo CD sync; ExternalSecret `Updated` |
| +2 m → | the producer connects to 9094. On MSK librdkafka logs `Disconnected while requesting ApiVersion: might be caused by incorrect security.protocol configuration (connecting to a SSL listener?)`; on Redpanda the connection is refused. The upload path passes no cancellation token, so `ProduceAsync` blocks until `message.timeout.ms` (300 s); uploads hang; the edge returns 504 at its route timeout | `POST /api/media` latency → seconds or minutes, 504 at the edge; librdkafka errors naming `:9094` in cms-backend logs |
| +2 m → | the worker cannot connect; no new messages, so lag stays flat | worker connection errors |
| — | brokers healthy (`kafkametrics`: 2 brokers; MSK metrics normal); the cluster collector was not restarted, so Kafka metrics keep flowing | — |

**Preconditions**: the clients still speak PLAINTEXT, which holds until ADR-020 WP 3.1. After 3.1 the scenario flips to an SSL client against a plaintext port.

**Alerts**:
- A4 (the upload action's success drops to ≈ 0 %) and A11 (producer errors).
- A3 barely moves: uploads are a small share of edge traffic.

**Tier 1 evidence**:
1. Only `POST /api/media` fails (route-level RED), at the edge timeout.
2. Producer errors name the new port.
3. Pods were replaced by Reloader with no Argo CD sync and no image or version change; ExternalSecret events.
4. The change event at T0: the Terraform apply or CloudTrail `PutParameter` on `lab`, the emulated CloudTrail `PutParameter` on `local`.
5. Brokers healthy.

**Root cause**: "SEC-290 published the TLS bootstrap (9094) before the clients support TLS (ADR-020 3.1). ESO propagated it in a minute and Reloader restarted the producers, whose produce calls now block for up to 300 s, so uploads time out at the edge."

**Wrong answers**:
- an MSK outage;
- a deployment, or Argo CD;
- a NetworkPolicy;
- a cms-backend bug.

**Mitigation**: revert the Terraform change (or restore the parameter); ESO and Reloader then roll the pods back.

**Follow-ups**:
- client TLS (ADR-020 3.1) before the switch;
- a Kafka connectivity check at startup and in readiness;
- a configurable message timeout, or produce outside the request path (outbox);
- an alert on producer errors (A11);
- treat parameter changes as change events (done in ADR-024).

**Reset**: branch reset plus a Terraform re-apply from the baseline (or restore the parameter); wait for ESO and Reloader.

---

## INC-5 — The bulk import

**Prompt**: "The media library page fails for everyone; it worked this morning."

**Trigger**: Sofia Marin, `data: import autumn campaign assets (CONT-58)`, adds a one-off Job `content-import-2026-11` that bulk-inserts **150,000** media rows (with an import batch id).

**Causal chain**:
1. The Job runs at +1–3 m.
2. `GET /api/media` (unbounded list) now loads about 170k rows with tags into memory.
3. cms-backend's working set reaches its 512Mi limit → **OOMKilled** → CrashLoopBackOff. With KEDA min 2, both pods crash in turn.
4. Envoy answers 503 `UH` (no healthy upstream) for all `/api` routes in bursts.
5. DB CPU and read rate spike from full-table queries.

**Tier 1 evidence**:
- restarts with last terminated reason `OOMKilled` (A9);
- Envoy 503 `UH` bursts with no matching server spans (A3; the edge-measured availability SLO feeds A2);
- memory working set climbing to the limit before each kill;
- `postgresql` rows inserted spiking at the Job time and DB size growing;
- the Job's own log line ("imported 150000 rows");
- the change event for the Job;
- no new `service.version`.

**Root cause**: "CONT-58 added 150k rows. The unbounded `GET /api/media` now materialises them all and the API is OOM-killed on every list request."

**Wrong answers**: a memory leak in a new release; node memory pressure; PostgreSQL down.

**Mitigation**:
- Reverting the Job **does not remove the data**. Lesson: data changes are not undone by Git.
- Immediate: delete the import batch (facilitator runs it); raising the memory limit only delays the crash.
- Follow-ups: serve the library page from the existing paged `GET /api/media/search`; cap or remove the unbounded `GET /api/media`; load-test data volumes; capacity review for imports.

**Reset**: branch reset; `reset.sh` deletes the batch and runs `VACUUM`.

---

## INC-6 — Noisy neighbour

**Prompt**: "The CMS feels sluggish in waves; some users are fine, others are not."

**Trigger**: Tom Weber, `qa: Black Friday readiness soak, 4× browsers (QA-77)`, in the overlay's loadgen config:
- `users.count` 10 → 40 and `max_contexts_per_pod` 10 → 40;
- in the same commit, the `canvas-load` memory limit 1536Mi → 6Gi, so 40 Chromium contexts fit. Without that the pod OOM-loops instead of saturating CPU.

`local` uses 24 users and 4Gi, calibrated in WS7.

**Causal chain**:
1. `canvas-load` (request 500m, limit 4 CPU) grows to about 4 cores of Chromium.
2. Its node reaches 100 % CPU.
3. Pods on that node slow down without being throttled: they are below their limits, competing for CPU.
4. APM latency splits by `k8s.node.name`.
5. On `local` (single node) the whole cluster slows.

**Tier 1 evidence**:
- node CPU utilisation (host metrics), and EC2 `CPUUtilization` (emulated on `local`, CloudWatch on `lab`), at about 100 % for one node;
- latency per node: only pods on that node are slow;
- low CFS throttling for the victims (contention, not limits);
- `canvas-load` usage ≫ request (Burstable over-commit);
- the change event for QA-77;
- RUM volume ×4.

**Root cause**: "QA-77 quadrupled the browser load generator, whose CPU use far exceeds its request, saturating its node and starving co-located API and database pods."

**Wrong answers**: an API code regression; DB right-sizing; throttling.

**Mitigation**: revert.

**Follow-ups**: a dedicated, tainted node group for load generators; requests that match real use; `PriorityClass`; topology spread.

**Reset**: branch reset (the StatefulSet restarts with 10 users).

---

## INC-7 — AZ rebalance strands the whiteboard (`lab` only, pre-staged)

**Prompt**: "The whiteboard won't load boards and live cursors are gone. The CMS mostly works."

**Trigger**: Aiko Tanaka, Terraform `capacity: move nodes to AZs b/c (CAP-19)`, changing the new `node_azs` variable in `envs/lab/infra.tfvars` from `[a, b]` to `[b, c]`.
- Today node subnets are derived from `node_az_count`, and changing `azs` would also move, and replace, MSK.

**Preflight** (in `lab-inject`): canvas-backend's volume and the CNPG primary must be in AZ a, because `WaitForFirstConsumer` places a volume wherever its first pod landed. If they are not:
- recreate the canvas-backend PVC in AZ a (lab data is disposable);
- switch the CNPG primary to the AZ-a instance.
- The managed node group is replaced (create-before-destroy), about 15–25 min end to end.
- Inject it about 25 min before the session, or deliver it as a replay.

**Causal chain**:
1. Old nodes in AZs a/b drain.
2. `canvas-backend`'s EBS volume (SQLite) lives in eu-west-1a; no node remains in AZ a, so the pod is Pending with `volume node affinity conflict`.
3. The `cms-postgres` instance in AZ a is Pending too. CNPG fails over to the AZ-b instance (a `57P01` burst) and runs degraded.
4. Envoy 503 `UH` on `/api/boards` (k6's steady canvas traffic) and `/hubs`; `demo-canvas-api` server spans stop (absence). RUM shows SignalR and board-load failures only if someone is using the whiteboard: the browser load runs in CMS mode.

**Tier 1 evidence**:
- `FailedScheduling` events with "volume node affinity conflict" (A13);
- node zone labels (only b/c);
- the Terraform apply event and CloudTrail `CreateNodegroup`/`DeleteNodegroup`;
- EC2 instance launches in b/c (ASG and EC2 metrics);
- the EBS volume in 1a idle or detached (AWS/EBS);
- the CNPG failover burst.

**Root cause**: "CAP-19 moved the node group to AZs b/c. The EBS volumes of canvas-backend and one PostgreSQL instance are bound to AZ a, so those pods cannot schedule anywhere."

**Mitigation**:
- Add AZ a back. Reverting replaces the node group again, which is slow.
- Discuss snapshot-and-restore into AZ b. No backup plan exists until phase 4, which is itself a finding.

**Follow-ups**: ADR-020 phases 3–4 (stateless canvas on PostgreSQL); zone-aware change review for stateful workloads.

**Reset**: re-apply the baseline `envs/lab` (≈ 20 min), outside a session.

---

## INC-8 — Least privilege, most outage

**Prompt**: "New uploads fail and some thumbnails are broken."

**Trigger**: Lee Novak, Terraform `sec: scope media bucket access to the uploads/ prefix (SEC-402)`. The cms-backend IRSA policy's resource changes from the prefix the S3 media store writes (for example `media/*`) to `uploads/*`.

- `lab`: applied through `terraform.yml`.
- `local`: needs `FLOCI_IAM_ENFORCEMENT=true` (floci evaluates IAM policies only then; gap G6).

**Causal chain**: within seconds of the apply, `PutObject` and `GetObject` return `AccessDenied`:
- uploads fail with 500. The file is stored before the event is produced, so no event is sent, Kafka sees nothing new, and lag stays flat;
- file downloads fail, so thumbnails break;
- the worker sits idle.

**Tier 1 evidence**:
- AWS SDK client spans `S3.PutObject`/`GetObject` with `AccessDenied` (403);
- exception logs;
- RUM image errors;
- the Terraform apply event, and CloudTrail `PutRolePolicy` on `lab`;
- no Argo CD sync and no pod changes.

**Root cause**: "SEC-402 scoped the cms-backend role to `uploads/*`, but the media store reads and writes `media/*`, so every S3 call is denied."

**Mitigation**: revert.

**Follow-ups**:
- IAM Access Analyzer `validate-policy`, and a least-privilege test on floci with enforcement on (as in F3);
- the store prefix as a published contract.

**Reset**: branch reset plus a Terraform re-apply.

---

## Backlog

| ID | Idea | Needs |
|---|---|---|
| INC-9 | **Lag snowball**: caption-stub latency rises ("larger model") → lag → a KEDA Kafka scaler on the worker with `allowIdleConsumers: true` scales past the 3 partitions → rebalances on every scale step → lag grows further; more workers also load cms-backend | KEDA Kafka trigger, `kafka.consumer_group.members` |
| INC-10 | **RDS right-sizing**: the AWS variant of INC-1 (instance class downsized by Terraform; CloudWatch `CPUUtilization`, `DBLoad`, `DatabaseConnections`; downtime during the modification) | ADR-020 3.3 RDS in `lab` |
| INC-11 | **Telemetry blind spot**: a wrongly rotated ingest key → Reloader restarts the collectors → export 403s → dashboards go quiet. Teaches noticing absence (no-data alerts; k8s-skills collector checks) | no-data alerts |

## Self-test summary (WF2 signatures)

| Scenario | Signature (query → condition → deadline) |
|---|---|
| INC-0 | `route_error_ratio{GET /api/media/filter}` > 15 % → +6 m; errors only on the new `service.version`; A3 → +7 m |
| INC-1 | `db_throttle_ratio` > 0.5 → +8 m; `api_p95_ms` > 1000 → +8 m; `cms_backend_replicas` ≥ 8 → +14 m (`lab`), ≥ 5 (`local`); `db_connection_ratio` ≥ 0.9 → +16 m |
| INC-2 | `kafka_lag` > 100 → +15 m; worker fetch errors > 0 → +5 m; API error ratio unchanged |
| INC-3 | edge `UT`/`URX` share > 5 % → +6 m; server/client rate ratio for `GET /api/media` > 2.5 → +6 m |
| INC-4 | `POST /api/media` edge 5xx > 50 % → +6 m; producer error logs > 0 → +4 m; A4 → +8 m; no Argo CD sync in the window |
| INC-5 | OOMKilled count ≥ 2 → +8 m; edge 503 `UH` > 0 → +10 m |
| INC-6 | node CPU > 90 % → +6 m; `canvas-load` CPU > 3 cores → +6 m |
| INC-7 | `FailedScheduling` "volume node affinity conflict" → +30 m |
| INC-8 | S3 `AccessDenied` spans > 0 → +3 m; `kafka_lag` flat |
