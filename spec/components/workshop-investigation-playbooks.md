# Component: Investigation Method, Demo Script, Skills and Facilitation

**Status**: Proposed (2026-11-02)  
**Decisions**: [ADR-023](../adr/ADR-023-incident-workshop.md)  
**Related**: [workshop-scenarios.md](workshop-scenarios.md) (answer keys), [workshop-telemetry-detection.md](workshop-telemetry-detection.md) (queries, alerts)  
**Inspired by**: [k8s-servant/k8s-skills](https://github.com/k8s-servant/k8s-skills) (Apache-2.0)

This spec defines:
- how participants (and agents) investigate;
- what evidence counts;
- the skills that encode the method;
- how the facilitator runs, hints and grades a scenario.

## Demo run of show (v1)

A presenter-led, ≈ 50-min live demo for a customer audience, from the presenter's Mac ([architecture §7](../architecture/incident-workshop.md#7-run-of-show)). Source files: `workshop/demo/run-of-show.md`, `olly-prompts.md`, `claude-prompts.md`.

### Roles and screens

- **Presenter**: narrates, asks Olly, drives the Coralogix UI.
- **Co-presenter** (optional): runs `make lab-*`, watches the clock, keeps Claude Code going in the background.
- **Screens**: Slack (alert channel and thread), the Coralogix UI, a terminal with Claude Code, and optionally the Argo CD UI.

### Timeline with commands

| Time | Beat | Command / action | Fallback |
|---|---|---|---|
| −30 m | Preflight; red-herring change for INC-1 | `make lab-preflight ENV=local`; `make lab-inject INC=INC-1` (runs the −10 m change, waits for go) | if WF1 fails: reset, or switch to the recording |
| 0:00 | Intro, emulation disclaimer; trigger INC-1 | continue `lab-inject` (FIN-142) | — |
| ≈ 0:06 | Alert in Slack → Olly thread (Olly 1–3) | ask in thread; start Claude Code in parallel with the INC-1 prompt | alert late: open D1 and narrate the rising p95 |
| ≈ 0:14 | Coralogix deep dive (APM → DB spans → K8s throttling → D2 change timeline → D3 → AWS emulated panel) | follow Olly's links | — |
| ≈ 0:20 | Optional hotfix beat | `make lab-stage INC=INC-1 STAGE=hotfix`; Olly: "Why didn't Sam's fix stick?" | skip if behind schedule |
| ≈ 0:23 | Olly 4 (fix); show Claude Code's finished report and revert; compare; inject INC-4 | `make lab-inject INC=INC-4` | Claude stalled: show the rehearsal transcript |
| ≈ 0:28 | Apply the fix; recovery | push Claude's revert, or `make lab-fix INC=INC-1` | — |
| ≈ 0:32 | INC-4: alert → Olly (what changed, who) → UI → fix | `make lab-fix INC=INC-4` | — |
| ≈ 0:44 | Takeaways T1–T7, Q&A | — | — |
| after | Reset for the next session | `make lab-reset ENV=local` | — |

### Olly conversation script

**Principles**:
- Ask outcome questions ("what changed", "why did it get worse", "what should we do"), not tool instructions.
- Follow Olly's own links into the UI.
- Accept Olly's wording as long as the facts match the expected content.

| Incident | Prompt | Expected content | Backup prompt if it drifts |
|---|---|---|---|
| INC-1 | "What is going on, and who is affected?" | `demo-cms-api` latency and errors on media routes since ≈ T+4 m; CMS journeys failing | "Show the error rate and p95 of demo-cms-api for the last 30 minutes." |
| INC-1 | "What changed shortly before it started?" | Argo CD sync of FIN-142 by Dana on `cms-postgres` (CPU limit); the earlier frontend change is unrelated | "List deployments and configuration changes in cms-local in the last hour." |
| INC-1 | "Why did it get worse after a few minutes?" | KEDA scaled cms-backend 2 → 10 on latency; connections at the ceiling; `53300` | "How many cms-backend pods are running, and how many PostgreSQL connections are open?" |
| INC-1 | "What should we do?" | stop the amplification (pause KEDA or cap replicas), revert FIN-142; later: pooler and connection budget | "Which change should we revert, and what stops the scaling loop?" |
| INC-1 (hotfix) | "Why didn't Sam's fix stick?" | Argo CD self-heal restored the Git state; the fix must go through Git | "What did Argo CD do right after the manual change?" |
| INC-4 | "Uploads fail, but nothing was deployed today. What changed?" | Reloader restarts after ExternalSecret `app-endpoints` changed; producer errors to `:9094`; no Argo CD sync | "Why did cms-backend restart at <time>?" |
| INC-4 | "Who changed it?" | emulated CloudTrail `PutParameter` by `aiko.tanaka` on the Kafka bootstrap parameter | "Show AWS API changes in the last hour." |

The script is final only after WS12 and WF8: ≥ 2 of 3 rehearsals reach the cause and a fix.

### Claude Code side by side

**Prompt** (one message, started in parallel with the Olly thread):

> Investigate the Coralogix alert "<alert name>" for cluster cms-local, which started around <time>. Use the incident skills. Find the root cause with evidence from Coralogix first, confirm read-only in the cluster and Argo CD, and propose the fix as a revert in the demo clone with an undo line. Do not change anything live.

**Expected path**: `incident-triage` → `incident-change-timeline` → `incident-postgres-saturation` → `incident-autoscaling-loops` → `incident-gitops-mitigation` → `incident-report`. Along the way it uses:
- `cx` queries from the cookbook;
- `kubectl get/describe` and `argocd app history`, read-only;
- a revert of FIN-142 in the demo clone, plus a KEDA pause change.

**Output**: the [report format](#report-format), with the cause sentence, at least 3 evidence items and the proposed changes. The presenter applies them or runs `lab-fix`.

**Comparison points for the audience** (no winner):

| | Olly | Claude Code with skills |
|---|---|---|
| Where it lives | in Coralogix and in the Slack thread, where the team already talks | in an engineer's terminal |
| What it sees | Coralogix data | the same Coralogix data through `cx`, plus the cluster, Argo CD and Git (read-only) |
| Typical output | explanation, deep links, recommended action | evidence list and a ready revert with undo |
| What both need | the telemetry in T7: buckets, change events, DB/Kafka metrics, trace-correlated logs | |

### Fallbacks

- **Late alerts**: narrate from D1/D2 while waiting.
- **Olly drifts**: use the backup prompts.
- **Claude Code fails or stalls**: show the latest rehearsal transcript.
- **The Mac or the network fails**: play the recording and open the replay links from the last rehearsal.

## Method

The workshop's first slide and the participant card:

1. **Detect**: start from the alert, SLO burn or user report. Write down what is affected and since when (**T0**).
2. **Triage**: measure impact.
   - Which SLI is affected, which services and routes, which users or sessions (RUM)?
   - Is it getting worse?
   - Name an Incident Commander and a scribe.
3. **Correlate changes**: list every change in [T0 − 60 min, now] from all sources:
   - Argo CD syncs;
   - Reloader/ESO restarts;
   - Terraform and CloudTrail;
   - autoscaler and scheduler events;
   - data jobs.

   Changes are hypotheses, not verdicts.
4. **Localise**:
   - **RED** (rate, errors, duration) per service, route, version and node, to find *where*;
   - **USE** (utilisation, saturation, errors) per resource, to find *why*;
   - the **network path** (client → edge → service → dependency) when the edge and the server disagree.
5. **Prove**: the cause must be supported by **at least three signals of at least two types** (metric, trace/span, log, event), **one of which is a change event**, and must explain *every* symptom. "One cause, one issue": symptoms that follow from the cause, such as Pending pods after a scale-out, are not separate causes.
6. **Mitigate**: take the fastest **safe** action that stops harm.
   - **Stop amplification first** (pause the autoscaler, disable retries), then **revert**.
   - Always through Git (or the Terraform pipeline). Never `kubectl` on a GitOps-managed object: self-heal reverts it (INC-1 demonstrates this).
7. **Verify**: the SLIs are back at baseline, alerts have resolved, and no new symptoms appeared. Repair data if the incident lost any (INC-2, INC-5).
8. **Report**: write the incident report (template below).

Rules of thumb on the card:

| Rule | Why |
|---|---|
| "Connection refused" means nothing listens. A timeout means a drop or a slow peer. "Name or service not known" means DNS | INC-2, INC-4 |
| Edge and server disagree? Compare request rates and durations on both sides before blaming either | INC-3 |
| Throttled means the container is at its CPU limit. Contended means the node is full. OOMKilled means the memory limit | INC-1, INC-5, INC-6 |
| Pods restarted without an Argo CD sync? Look for Reloader/ESO, node events, OOM | INC-4, INC-5 |
| Argo CD green ≠ app healthy: it tracks manifests, not behaviour | INC-4 |
| Data changes are not reverted by `git revert` | INC-5 |
| Say what you could not see. Never call something healthy without evidence | all |

### Evidence tiers

| Tier | Sources | Rule |
|---|---|---|
| 1 | Coralogix: APM/span metrics, spans, logs, metrics, RUM, Kubernetes events and objects, change events, AWS metrics, CloudTrail | must be enough to prove the cause |
| 2 | read-only Argo CD (`app get/history/diff`), `kubectl get/describe/logs/events`, AWS console or CLI `describe*/get*/list*` | confirmation; live runs only |

### Report format

```
Cause (one sentence): <change> caused <mechanism> which led to <user impact>.
Evidence:
  1. <signal, query or link, time>   (type: metric | span | log | event | change)
  2. …
Timeline (UTC): T0 change … · first symptom … · detection … · mitigation … · recovery …
Mitigation applied / proposed (with undo): <git revert …>   # Undo: <how to roll back the mitigation>
Contributing factors: …
Follow-ups (owner, priority): …
What we could not verify: …
```

Templates in `workshop/templates/`:
- `incident-report.md` (above);
- `status-update.md` (every 15 min during long scenarios: impact, current hypothesis, next action, ETA);
- `postmortem.md`: blameless; summary, impact, timeline, detection review ("what alerted first, what should have"), root cause, contributing factors, what went well, action items.

## Skills

The same documents serve as human runbooks (participant handbook appendix) and as agent skills. They follow the **k8s-skills format**, adapted:

| Element | Convention |
|---|---|
| Location | `workshop/skills/<name>/SKILL.md`, optional `references/*.md` |
| Frontmatter | `name` (= folder), `description` (≤ 1024 chars, starts "Use when…", lists literal symptoms and error strings, ends "Reads first and proposes changes through Git."), `license: Apache-2.0`, `metadata.verified-with` (chart, Argo CD, KEDA, CNPG, Envoy Gateway, cx CLI versions), `metadata.verified-on` |
| Sections, in order | **When to use** (symptoms; hand-offs by skill name) · **Investigate** (numbered steps; each has a one-line reason, a Coralogix query block, and an optional Tier 2 command) · **Read the results** (literal value or pattern → meaning) · **Proposed fix** (Git diff or Terraform change, with `# Undo:`) · **Sources** (upstream docs at pinned versions) |
| Length | ≤ 500 lines per skill |
| Queries | named queries from the [cookbook](workshop-telemetry-detection.md#query-cookbook-indicative), run with `cx` (`cx metrics query`, `cx logs`, `cx spans`) or pasted into Coralogix |

### Command tiers (agents and participants)

| Tier | Allowed | Examples |
|---|---|---|
| Run freely | read-only queries and reads | `cx logs/spans/metrics/service-catalog/infra …`; `kubectl get/describe/logs/events/top`; `argocd app get/history/diff`; `aws … describe*/get*/list*`; `git log/show/diff` |
| Ask first (facilitator approves in live runs) | proposing a change; read-only probes in a debug pod | opening a PR (revert, KEDA pause annotation); `kubectl debug` + `nslookup`/`curl` |
| Never | any live mutation or secret read | `kubectl apply/patch/edit/scale/delete/rollout restart`; `argocd app sync --force/rollback/set`; `terraform apply`; AWS writes; reading Secret values |

Every proposed change carries a literal `# Undo:` line with the values found.

### Skill catalog

| Skill | Use when | Primary signals | Hands off to |
|---|---|---|---|
| `incident-triage` | an alert, SLO burn or user report arrives and nobody knows where to look | SLO burn, D1, RUM sessions, alert list | the next skill by symptom |
| `incident-change-timeline` | any incident: "what changed?" | `change_timeline`, kube events, `service.version`, ESO/Reloader events, CloudTrail, Terraform events | `incident-gitops-mitigation` |
| `incident-apm-localize` | latency or errors on a service, route or version; edge and client disagree | `api_p95_ms`, `route_error_ratio`, `version_compare`, service map, trace exemplars, client (k6/RUM) vs server rates | `incident-postgres-saturation`, `incident-network-path`, `incident-kafka-pipeline` |
| `incident-postgres-saturation` | DB spans slow, `53300`/`57P01` errors, pool timeouts | `db_cpu_usage_cores` vs limit, `db_throttle_ratio`, `db_connection_ratio`, Npgsql pool metrics, DB span metrics, `pg_stat_statements` (Tier 2) | k8s-skills: cloudnative-pg |
| `incident-autoscaling-loops` | replicas rising during an incident; HPA/KEDA at max; Pending pods; node scale-up | KEDA scaler value, HPA replicas, `SuccessfulRescale`/`TriggeredScaleUp`, connection budget, `pods_pending` | k8s-skills: autoscaling, node |
| `incident-k8s-resources` | slow pods, restarts, OOM, evictions | throttling vs node CPU, working set vs limit, last terminated reason, QoS | k8s-skills: workload, node |
| `incident-network-path` | 5xx/504 at the edge, timeouts between services, policy changes | `edge_flags`, `edge_retry_rate`, edge vs server spans, client errors (refused/timeout/DNS), NetworkPolicy changes | k8s-skills: network, envoy-gateway, envoy, gateway-api |
| `incident-kafka-pipeline` | uploads hang, captions missing, consumer lag | producer error logs, `kafka_lag`, consumer group members, broker metrics, worker spans | k8s-skills: external-secrets (config path) |
| `incident-aws-signals` | node, volume, IAM, MSK, NLB or NAT suspicion; anything Terraform-driven | CloudWatch metrics in Coralogix, CloudTrail events, node zone labels, IRSA errors in spans | read-only `aws` CLI |
| `incident-gitops-mitigation` | choosing and applying a safe mitigation; "my fix didn't stick" | Argo CD history and self-heal events, KEDA pause annotation, revert PR | k8s-skills: argocd |
| `incident-report` | writing the report or postmortem from the evidence | templates above | — |

### Composition with k8s-skills

- **Reuse, don't fork**: the workshop does not copy k8s-skills. Agents install it pinned to a release, as its Claude Code plugin. Hand-offs name its skills by subject: workload, node, network, storage, autoscaling, argocd, external-secrets, envoy-gateway, envoy, gateway-api, cloudnative-pg, opentelemetry-collector. Exact skill names are resolved against the pinned release.
- **What we add on top**:
  - the telemetry-first entry (alert → APM → resource);
  - change timelines across Git, AWS and the cluster;
  - EKS/AWS signals;
  - Kafka;
  - autoscaling feedback loops.

  The k8s-skills report lists all of these as gaps; open issue #80 there asks for EKS coverage.
- **Rubric reuse**: the `expected.md` rubric shape (Prompt, Cause, Evidence, Acceptable fixes, Wrong answers) is adopted for every scenario. The `break.sh`/`cleanup.sh` idea becomes `changes/` plus `reset.sh`, delivered through Git instead of `kubectl`.

## Agent setup (Claude Code)

**Goal**: an AI agent investigating the same incident with the same skills and the same read-only limits. In v1 it runs side by side with Olly in the demo; in v2 teams may try it hands-on.

**Setup** (documented in `workshop/handbook/facilitator.md`):

| Piece | Detail |
|---|---|
| Agent | Claude Code (or any SKILL.md-capable agent) with `workshop/skills` and the pinned k8s-skills plugin |
| Coralogix | `cx` CLI with a workshop-team API key: query scopes only, rotated after the workshop |
| Kubernetes | view-only kubeconfig. EKS: access entry with `AmazonEKSViewPolicy`. floci: a ServiceAccount token bound to `view`, because IAM principals are cluster-admin there (gap G5) |
| Argo CD | `role:readonly` local account token |
| Guard | k8s-skills' secret-guard hook (blocks commands that read Secrets) |

**Input**: only the scenario prompt. **Grading**: the same `expected.md` rubric as humans.

**Rehearsal check (WF7)**: before each demo, and nightly on `local` where possible, INC-1 and INC-4, 3 runs each; pass if at least 2 of 3 runs name the correct cause with valid evidence. A failure points at telemetry or skill gaps, not at the scenario.

## v2: Hands-on facilitation (deferred)

### Before the workshop

- [ ] `make lab-up` (T−1 day) and `make lab-baseline`: WF1 green for 1 h with traffic on.
- [ ] `make lab-selftest INC=<each planned>` on `local` or `lab` within the last 7 days: WF2–WF4 green.
- [ ] Coralogix: participant users created, dashboards D1–D4 shared, alert channel tested, Cases enabled (if used).
- [ ] Handouts: system map, method card, query cheat sheet, rules of engagement.
- [ ] Traffic rate set to baseline 30 min before the start; RUM key and quotas checked.

### During a scenario

- **Prompt**: read the scenario prompt verbatim, then start the timer and `make lab-inject`.
- **Hint ladder** (in `facilitator.md` per scenario, given at 40 %, 60 % and 80 % of the timebox):

  | Hint | Points | Example (INC-1) |
  |---|---|---|
  | H1 | direction | "Look at what changed shortly before the first alert." |
  | H2 | narrows | "Compare the database's CPU usage with its limit." |
  | H3 | near-answer | "Open the sync at T+n and read its diff; then count connections × replicas." |
- **Stages**: run with `make lab-stage` at the scripted time; the on-call persona announces them.
- **Mitigation**: apply the first correct, safe mitigation a team proposes, via Git, and announce it. Teams verify recovery themselves.

### Scoring (per team, per scenario)

| Criterion | Points |
|---|---|
| Acknowledged the first alert and named impact and T0 within 5 min | 0–2 |
| Cause sentence matches `expected.md` | 0–4 |
| Evidence: ≥ 3 signals, ≥ 2 types, includes the change event | 0–3 |
| Safe mitigation in the right order (stop amplification, then revert) with undo | 0–2 |
| Time bonus: cause within 50 % of the timebox | +1 |
| Each hint used | −1 |
| Committed to a listed wrong answer (in the report or by proposing its fix) | −2 |
| Proposed an unsafe action (live mutation, secret read) | −3 |

### Debrief (10–15 min per scenario)

1. What was the very first signal, and who saw it?
2. Which alert helped, which was noise, and what was missing (INC-2: none fired)?
3. Walk the evidence chain on D2 (change timeline).
4. Contributing factors: what made the change look safe?
5. What would you change in your own environment tomorrow?

## v2: Participant handbook (outline, `workshop/handbook/participant.md`)

1. **The system**: architecture diagram, and service names as Coralogix shows them:
   - APM: `demo-cms-api`, `demo-cms-media-worker`, `demo-canvas-api`;
   - RUM: `cms-frontend`, `canvas-frontend`;
   - kube events: `kube-events`; change events: `changes`; edge: `edge`.
2. Where things live in Coralogix: APM Service Catalog and service map, Explore (logs, spans, metrics), Infrastructure (Kubernetes), RUM, dashboards D1–D4, alerts, SLOs, Cases.
3. The method card and rules of thumb (above).
4. Query cheat sheet: the cookbook, reduced to copy-paste PromQL and DataPrime.
5. Rules of engagement: read-only; propose changes as diffs; no secrets; ask the facilitator for Tier 2.
6. Templates: incident report, status update.
