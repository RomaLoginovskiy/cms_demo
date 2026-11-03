# Component: Demo and Lab Platform

**Status**: Proposed (2026-11-02)  
**Decisions**: [ADR-023](../adr/ADR-023-incident-workshop.md), [ADR-024](../adr/ADR-024-investigation-telemetry.md)  
**Related**: [incident-workshop.md](../architecture/incident-workshop.md), [workshop-scenarios.md](workshop-scenarios.md), [gitops-argocd.md](gitops-argocd.md), [terraform-infrastructure.md](terraform-infrastructure.md), [floci-local-environment.md](floci-local-environment.md)

## Responsibility

This component provides:

- the **demo profile** on the presenter's Mac (`local`, v1);
- the **workshop baseline** on top of the cms-demo platform: PostgreSQL, autoscaling, traffic, seed data, caption stub, emulated AWS signals;
- the tooling that injects, stages, fixes, resets, self-tests and records scenarios;
- the short-lived AWS `lab` environment (v2, deferred).

It changes nothing in `dev` or `prod`.

## Repository layout (new paths)

```
deploy/
  argocd/applicationsets/
    cloudnative-pg.yaml          # cluster selector workshop=true
    keda.yaml                    # cluster selector workshop=true
    cluster-autoscaler.yaml      # cluster selector workshop=true, cloud=aws
  platform/
    cloudnative-pg/values.yaml
    keda/values.yaml
    cluster-autoscaler/values.yaml
    coralogix-otel/overlays/lab/            # clusterName cms-lab + workshop receivers (telemetry spec)
    coralogix-otel/overlays/local-workshop/ # local + workshop receivers (selected when workshop=true)
    argo-cd/values-lab.yaml                 # required: the gitops stack reads values-<env>.yaml
    storage/lab/                            # gp3 StorageClass for the storage ApplicationSet
    aws-signal-emulator/                    # emulated AWS metrics and events (local demo only)
  apps/cms-demo/
    components/workshop/               # baseline, environment-neutral
    components/workshop-sizing-local/  # 1 PostgreSQL instance, reduced requests, KEDA max 6
    components/workshop-sizing-lab/    # 2 PostgreSQL instances, KEDA max 10
    overlays/lab/                      # like dev: hostnames, replicas, image tags, loadgen/k6 targets
infra/
  terraform/envs/lab/                  # backend.hcl + global/infra/gitops/observability tfvars
  terraform/stacks/observability/      # Coralogix provider (telemetry spec)
  terraform/modules/coralogix-aws/     # metric streams + CloudTrail shipper (telemetry spec)
  mk/lab.mk                            # make lab-* targets
workshop/
  README.md
  scenarios/INC-<n>-<slug>/            # scenario packs (contract below)
  skills/<skill>/SKILL.md              # investigation skills (playbooks spec)
  demo/run-of-show.md, olly-prompts.md, claude-prompts.md   # v1 demo script (playbooks spec)
  handbook/participant.md, facilitator.md
  templates/incident-report.md, status-update.md, postmortem.md
  tools/                               # inject, stage, reset, selftest, record (bash + git + cx + argocd + kubectl)
  runs/                                # run records (gitignored)
```

## Demo profile (`local`, v1)

The v1 demo runs entirely on the presenter's Mac: floci, k3s `cms-local`, with the workshop components on (`make local-all WORKSHOP=1 PROFILE=demo`).

**Workshop label on `local`**: `make local-all WORKSHOP=1` sets the cluster label `workshop=true` through the new gitops variable. The `coralogix-otel` ApplicationSet then renders `overlays/local-workshop` instead of `overlays/local`. Without the label, no collector references the workshop receivers or their Secrets, and the Secret references are `optional: true` anyway. Everything else matches [floci-local-environment.md](floci-local-environment.md).

### Host and sizing

| Item | Demo profile |
|---|---|
| Docker Desktop | 6 CPUs, ≈ 19.5 GiB RAM, ≥ 100 GB disk (as for floci today); build cache pruned before a demo day |
| k3s caps | `FLOCI_SERVICES_EKS_MAX_VCPUS=6`, `FLOCI_SERVICES_EKS_MAX_MEMORY_MIB=12288` (`PROFILE=demo`) |
| Traffic | k6 **15 rps** (same mix), **4** browser users; calibrated in WS7 so INC-1's knee still holds |
| KEDA | max 6 replicas (`workshop-sizing-local`) |
| Host apps | Slack, a browser with Coralogix, a terminal with Claude Code. WS7 checks that the Mac stays responsive with all of them open |

### Git flow on the local mirror

Argo CD on `local` reads branch `local` of the Gitea mirror. `make local-sync` publishes a **snapshot** commit, which would hide the persona author and message that Olly and the Coralogix annotations (ADR-025) are meant to surface. During a demo:

1. **Prepare** (once per demo day): `make local-sync`, then tag the mirror head as `demo-baseline` (`make lab-baseline ENV=local`).
2. **Inject**:
   - `make lab-inject ENV=local INC=…` clones the mirror into `$TMPDIR` and applies the scenario's patch as a **real commit** with the persona author and message.
   - It pushes that commit to `local` on top of `demo-baseline` and asks Argo CD to refresh.
3. **Fix**: `make lab-fix ENV=local INC=…` pushes the documented mitigation the same way (author: the presenter or "Sam (on-call)"). It can also push the commit Claude Code drafted in that clone.
4. **Reset**: `make lab-reset ENV=local` force-pushes `demo-baseline` to `local` and runs the scenario's `reset.sh`.

`make local-sync` is **not** run between the baseline tag and the reset; it would overwrite the demo history. The developer's working tree, index and branches are never touched.

### Slack, Olly and Claude Code

| Piece | Setup | Verified by |
|---|---|---|
| Slack | Coralogix notification routing for the demo team posts P1–P3 workshop alerts to `#cms-demo-incidents`, with deep links | a test alert in preflight |
| Olly | enabled for the demo team and reachable from the alert thread in Slack (exact integration confirmed in WS12) | the INC-1 prompt script in rehearsal (WF8) |
| Claude Code | `workshop/skills` and the pinned k8s-skills plugin; `cx` CLI with a demo-team key (query scopes only); kubeconfig for ServiceAccount `demo-viewer` bound to `view` (floci makes IAM principals cluster-admin, gap G5); Argo CD local account `demo-viewer` with `role:readonly`; k8s-skills secret-guard hook | WF7 in rehearsal |
| Argo CD UI (optional) | `kubectl port-forward` on the presenter's machine | preflight |

### Emulated AWS signals

The `aws-signal-emulator` (namespace `observability`) is selected by `workshop=true` on clusters with `cloud=floci`. Its mappings and labels are specified in the [telemetry spec](workshop-telemetry-detection.md#emulated-aws-signals-local-demo).

### Preflight (`make lab-preflight ENV=local`, 30 min before going live)

1. WF1 baseline green, traffic on, Argo CD Synced/Healthy.
2. A test alert lands in Slack, and Olly answers a trivial question in its thread.
3. Claude Code: `cx` query, `kubectl get pods -n cms-demo` and `argocd app list` all succeed with the read-only identities.
4. Emulated AWS series are fresh (< 2 min old) and labelled.
5. The fallback recording and the replay links of the last rehearsal are at hand.

## v2: Environment `lab` (deferred)

Built from the same stacks as `dev` ([terraform-infrastructure.md](terraform-infrastructure.md#repository-layout)). Besides `envs/lab/*.tfvars` and `backend.hcl`, the lab needs:

- the per-environment files above: Argo CD `values-lab.yaml`, `storage/lab/`, the Coralogix `lab` overlay;
- **stack code**:
  - `stacks/gitops`: a `workshop` variable that adds the cluster label (`cluster_labels` holds only `environment` and `cloud` today);
  - `stacks/infra`: an optional `cluster-autoscaler` IRSA role, the reader scopes for the new secrets and parameters, and a `node_azs` variable for INC-7 (node subnets are derived from `node_az_count` today, and changing `azs` would also move MSK);
- an optional tag-filtered budget (below).

| Setting | `lab` | Difference from `dev` |
|---|---|---|
| Cluster | `cms-lab`, EKS 1.37 | name |
| VPC | `10.40.0.0/16`, AZs a/b/c, nodes in a/b | CIDR |
| Node group | m7g.xlarge, min 2 / desired 2 / **max 4** | max 4 for Cluster Autoscaler |
| Node autoscaling | Cluster Autoscaler, IRSA role `cluster-autoscaler` | new |
| Kafka | MSK, 2× kafka.t3.small, `TLS_PLAINTEXT` | same |
| Public entry | `https://cms-lab.<domain>`, NLB allowlist = facilitator and venue CIDRs + NAT EIPs | hostname, allowlist |
| Argo CD cluster labels | `environment=lab`, `cloud=aws`, `workshop=true` | `workshop` label |
| Argo CD revision | `gitops_revision = lab/live` | branch |
| AWS account | own account, or the `dev` account. In `dev`'s account the once-per-account `global` stack (ECR `cms-demo/*`, `cms-demo-gha-*` roles, budget `cms-demo-monthly`) is reused, never applied for `lab` | shared `global` |
| Budget | USD 150/month alarm, filtered on tag `Environment=lab` when the account is shared | limit, filter |
| Tags | `Environment=lab`, `ExpiresAt=<date>` | `ExpiresAt` |
| Coralogix | `clusterName: cms-lab`; same EU1 team as WQ4 decides | cluster name |

**Bring-up**: `make lab-up` runs `infra` → secret values (operator) → `gitops` → `observability`, then `make lab-baseline`. It runs `global` first only when `lab` has its own account. It takes about 45–60 min, mostly MSK.

**Teardown**: `make lab-down` runs `predestroy` and destroys the stacks in reverse order; WF6 then checks for leftovers.

## Workshop baseline (`components/workshop`)

### How the workshop component reaches the app

- The `cms-demo` ApplicationSet's `templatePatch` adds Kustomize components to the Application when the cluster has `workshop=true`: `../../components/workshop` plus `../../components/workshop-sizing-<environment>`. Argo CD's `source.kustomize.components` does the adding.
- Overlays stay free of workshop references, so `dev` and `prod` cannot pick them up by accident.
- The same ApplicationSet adds `ignoreDifferences` on `/spec/replicas` for Deployment `cms-backend`, and the workshop component removes `replicas` from it. Without both, self-heal would fight the autoscaler.

### PostgreSQL `cms-postgres` (CloudNativePG)

**Operator**: Helm chart pinned by the `cloudnative-pg` ApplicationSet, namespace `cnpg-system`. Argo CD needs a Lua health check for `postgresql.cnpg.io/Cluster` (healthy when `status.phase` reports a healthy cluster); it goes into `configs.cm` of [argo-cd values](../../deploy/platform/argo-cd/values.yaml).

**Cluster** spec (baseline = the state each scenario starts from):

| Field | Value |
|---|---|
| `instances` | 2 (`lab`, spread across zones) · 1 (`local`) |
| `resources` | requests `cpu: 1`, `memory: 2Gi`; limits `cpu: 2`, `memory: 2Gi` (`local`: requests `cpu: 500m`, `memory: 1Gi`) |
| image | PostgreSQL ≥ 16 (needed for `reserved_connections`) |
| `postgresql.parameters` | `max_connections: "100"`, `reserved_connections: "3"`, `shared_buffers: 512MB`, `pg_stat_statements.track: all` (CNPG adds the library to `shared_preload_libraries` itself; setting it directly is rejected) |
| storage | 10Gi on the default class (`gp3` / `local-path`) |
| bootstrap | `initdb` database `cms`, owner `cms` |
| managed roles | `otel_monitor` in `pg_monitor` and `pg_use_reserved_connections`, so metrics keep flowing when ordinary connections are exhausted (INC-1). Password from Secret `db-monitoring`, an ExternalSecret from `cms-demo/<env>/db-monitoring` (store `app-secrets`) |
| backups | none: the lab is disposable |

**Sync waves**: the Cluster goes in wave −2 (with the ExternalSecrets), the EF Core migration Job (P2) in wave −1, and `lab-seed` as a PostSync hook.

**cms-backend connection settings** (workshop component patch):
- `Database__Provider=postgres`.
- `ConnectionStrings__DefaultConnection` is composed from the CNPG application Secret `cms-postgres-app` (`host`, `port`, `dbname`, `user`, `password` as env vars) plus `Maximum Pool Size=20;Timeout=15;Command Timeout=30`.
- The pool size is deliberate. 20 per pod × 10 pods = 200 connections, against 94 available to ordinary roles (100 minus 3 superuser-reserved minus 3 `reserved_connections`). This **connection budget** violation is what INC-1 exposes.

### Autoscaling

**KEDA** (ApplicationSet `keda`, namespace `keda`, chart pinned). `ScaledObject cms-backend`:

| Setting | Value |
|---|---|
| min / max replicas | 2 / 10 (`lab`) · 2 / 6 (`local`) |
| trigger 1 | `prometheus`. `serverAddress`: the Coralogix PromQL endpoint (WS2). `query`: server-span p95 of `demo-cms-api` over 2 m, filtered on the cluster's own `k8s.cluster.name` (cookbook in the telemetry spec). `threshold: "300"`, `metricType: AverageValue`, `authModes: bearer` with `TriggerAuthentication coralogix-query` |
| trigger 2 | `cpu`, `Utilization`, `70` |
| `pollingInterval` | 15 s (`cooldownPeriod` only matters when scaling to zero, which is not used) |
| HPA behaviour | scale-up: no stabilisation, up to +100 % per 30 s (2 → 4 → 8 → 10); scale-down: 300 s stabilisation |
| `fallback` | `failureThreshold: 3`, `replicas: 2` |

The `TriggerAuthentication` reads Secret `coralogix-query`. ExternalSecret `coralogix-query` (store `app-secrets`) fills it from `cms-demo/<env>/coralogix-query`, a Coralogix key with metrics-query scope for the workshop team only. The app reader scope in `stacks/infra` gains that secret and `db-monitoring`.

**Replica math** shown in the debrief: with `AverageValue`, the HPA wants ⌈p95 ÷ 300 ms⌉ replicas. At baseline that is 150 ms → 1, clamped to 2. During INC-1 it is 3,000 ms → 10.

**cms-backend sizing** in the workshop component (all environments): requests `cpu: 500m`, `memory: 256Mi`; limits `cpu: 1`, `memory: 512Mi`.

The same request on `local` keeps the CPU trigger quiet at baseline. It also makes the extra replicas genuinely Pending on the single k3s node, which is part of INC-1's local picture.

**Cluster Autoscaler** (`lab` only; ApplicationSet `cluster-autoscaler`, `kube-system`):
- Chart pinned.
- Auto-discovery uses the tags EKS sets on managed node group Auto Scaling groups.
- IRSA role `cluster-autoscaler` with the documented minimal policy.
- Flags: `--balance-similar-node-groups`, `--expander=least-waste`, default scale-down delays.
- Terraform adds the role to `eks.irsa_roles` in `envs/lab` only.

### Traffic

| Source | What | Target | Telemetry |
|---|---|---|---|
| `canvas-load` (existing) | 10 Chromium users, CMS funnels (`cms_uploader` / `cms_curator` / `cms_browser`) | per overlay, as today | RUM; `:9091` scraped |
| `lab-traffic` (k6, new) | open model, `constant-arrival-rate`, **30 rps** baseline: 45 % `GET /api/media/filter?tags=…`, 33 % `GET /api/media/{id}`, 20 % `GET /api/media/tags`, 2 % `GET /api/media`. The full list stays under 5 % so it never sets the p95 that KEDA scales on. Plus 0.2 rps upload → get → delete, and 1 rps `GET /api/boards`. The browsers run in CMS mode, so this is the canvas API's only steady traffic (INC-7) | `local`: `http://cms-edge.edge.svc.cluster.local:443`; `lab`: `https://cms-lab.<domain>` through NAT. The public path is chosen so traffic also crosses the NLB; an in-cluster call with the public `Host` header would also work, because the AWS listener's PROXY protocol is optional | OTel metrics output to `otel-agent.observability.svc.cluster.local:4317` (client-side latency and errors) |

**k6 settings**:
- `preAllocatedVUs: 50`, `maxVUs: 400`, so the arrival rate holds while latency reaches seconds.
- Rate and mix live in ConfigMap `lab-traffic-config` and change only through Git.
- Rate `0` between sessions.

**k6 image**: `grafana/k6`, pinned, multi-arch.

### Dataset seed `lab-seed`

A PostSync hook Job, idempotent (a marker row):

- inserts **20,000** media rows and **300** tags (about 3 tags per item, about 10 % of tags hyphenated, for INC-0);
- spreads `uploaded_at` over 90 days;
- points rows at 50 small seeded objects in the media bucket, so `GET /api/media/{id}/file` works.

The sizes are calibrated in WS7 so that `GET /api/media` takes 300–700 ms at baseline. INC-3 and INC-5 depend on this.

### Caption stub `caption-stub`

**Why it exists**: the worker commits an offset only after it has stored a caption. Without a working endpoint, consumer lag grows forever and cannot be used as a signal.

**What it is**:
- An OpenAI-compatible `POST /v1/chat/completions` that returns a canned description after a configurable delay (default 300 ms).
- Deployment with 1 replica, about 20 MiB.
- The workshop component sets the media-worker's `OpenAI__BaseUrl=http://caption-stub:8080/v1` and `OpenAI__Model=caption-stub`.

**Prerequisite**: P4, otherwise every caption nulls the title.

### Network policies (additions)

`cms-demo` denies ingress by default ([policies.yaml](../../deploy/apps/cms-demo/base/network-policies/policies.yaml)). The workshop component adds:

| Policy | From | To | Ports | Why |
|---|---|---|---|---|
| `allow-cnpg-operator` | namespace `cnpg-system` | pods `cnpg.io/cluster=cms-postgres` | 8000, 5432 | operator status and management |
| `allow-observability-to-postgres` | namespace `observability` | pods `cnpg.io/cluster=cms-postgres` | 5432, 9187 | `postgresql` receiver; optional CNPG exporter |
| `allow-observability-scrape` | namespace `observability` | pod `canvas-load-0` | 9091 | load generator metrics scrape |

Intra-namespace traffic (cms-backend → cms-postgres, worker → caption-stub) is covered by `allow-same-namespace`. INC-2 changes exactly that policy, so its changeset keeps these paths.

### On-call persona identity

- ServiceAccount `oncall-sam` with Role `oncall-edit` in `cms-demo`: `patch` on Deployments, `clusters.postgresql.cnpg.io` and `scaledobjects.keda.sh`.
- Used only by stage scripts, through a short-lived `kubectl create token`.
- On EKS the audit log shows `system:serviceaccount:cms-demo:oncall-sam`. `managedFields` shows only the client, `kubectl-patch`.
- On floci, IAM principals are cluster-admin anyway (gap G5).

## Scenario pack contract

```
workshop/scenarios/INC-1-right-sized/
  scenario.yaml          # metadata, timings, signatures, reset (schema below)
  changes/
    00-red-herring.patch # optional earlier change; git format-patch with the persona as author
    10-trigger.patch     # the trigger; *.local.patch / *.lab.patch when paths differ
  terraform/             # optional *.tfvars.patch or stack patch applied to envs/<env>
  stages/hotfix.sh       # optional imperative stage (runs as oncall-sam)
  reset.sh               # state reset beyond the branch reset (rows, offsets, pauses)
  queries.yaml           # Tier 1 evidence queries (PromQL / DataPrime) with expected shape
  expected.md            # rubric: Prompt, Cause, Evidence, Acceptable fixes, Wrong answers
  facilitator.md         # brief, hint ladder, timings, debrief questions, variants
```

```yaml
# scenario.yaml (schema by example)
id: INC-1
title: Right-sized into an outage
environments: [local, lab]
requires: [workshop-baseline]
level: 3
slot_minutes: 75         # agenda slot: brief, investigation, mitigation, debrief
timebox_minutes: 45      # investigation only
prompt: >
  Support has two tickets: the media library is slow and sometimes fails to load.
  Several alerts fired in the last few minutes. Investigate.
changes:
  - at: -10m
    patch: changes/00-red-herring.patch
  - at: 0m
    patch: changes/10-trigger.patch   # changes/10-trigger.local.patch on local: it must also
                                      # lower workshop-sizing-local's request (request ≤ limit)
stages:
  - name: hotfix
    at: +15m
    run: stages/hotfix.sh
    announce: "Sam (on-call): I bumped the database CPU by hand. Should be fine now."
signatures:              # WF2: each must hold before its deadline
  - {query: db_throttle_ratio, op: ">", value: 0.5, deadline: +8m}
  - {query: api_p95_ms, op: ">", value: 1000, deadline: +8m}
  - {query: cms_backend_replicas, op: ">=", value: 8, deadline: +14m, env: lab}
  - {query: db_connection_ratio, op: ">=", value: 0.9, deadline: +16m}   # ordinary roles cap at 94/100
alerts_expected:         # alert → deadline; burn-rate alerts need their long window to fill
  {A3: +8m, A4: +10m, A6: +10m, A5: +14m, A7: +14m, A1: +22m, A2: +22m}
reset: {branch: true, script: reset.sh, baseline_within: 10m}
variants:
  a: {trigger: changes/10-trigger.patch}           # CPU limit 2 → 250m
  b: {trigger: changes/11-trigger-maxconn.patch}   # max_connections 100 → 40
```

Commit identity: the author is the persona (for example `Dana Okafor <dana.okafor@finops.invalid>`) and the committer is the facilitator. No trailer reveals the workshop.

## Tooling (`make lab-*`, implemented in `workshop/tools`)

| Target | Does |
|---|---|
| `lab-up` / `lab-down` | create / destroy `envs/lab` (all stacks), then baseline / WF6 |
| `lab-baseline` | tag the current branch head as the baseline (`lab-baseline-<yyyymmdd>` on `lab/live`; `demo-baseline` on the local mirror), run WF1 |
| `lab-inject ENV= INC= [VARIANT=]` | preflight, apply the changes on schedule, record T0 |
| `lab-fix ENV= INC=` | push the scenario's documented mitigation (or a drafted commit) as a real commit; record the time |
| `lab-preflight ENV=` | the go-live checklist: WF1, Slack test alert, Olly, Claude Code identities, emulator freshness |
| `lab-stage INC= STAGE=` | run a scripted stage, record its time |
| `lab-status` | Argo CD sync/health, KEDA/HPA replicas, firing alerts, scenario clock |
| `lab-selftest INC= [RUN=]` | WF2 and WF4: evaluate signatures and evidence queries with `cx` for the run window |
| `lab-reset ENV=` | branch reset, Terraform re-apply if needed, `reset.sh`, WF1; prints the duration |
| `lab-record` / `lab-replay-pack` | write the run record / build the replay handout |

**`lab-inject` behaviour**:

1. **Preflight**:
   - all Applications Synced/Healthy;
   - WF1 passes (`FORCE=1` skips this);
   - traffic targets point at the lab;
   - no other scenario is active.
2. **`lab`**:
   - Fetch `lab/live` into a scratch worktree under `$TMPDIR`, `git am` the patch, push, and request an Argo CD refresh of the `cms-demo` Application. The refresh only shortens the 180 s poll; auto-sync does the rest.
   - A Terraform change is applied by the facilitator from a scratch copy of the stack with `make tf ENV=lab STACK=<stack> CMD=apply`. The trail is the Terraform change event plus CloudTrail under the facilitator's role.
   - CI cannot apply `lab` today: `terraform.yml` has no `workflow_dispatch` or lab job, and the `cms-demo-gha-tf-apply` role trusts only `environment:dev|prod`. A lab GitHub environment, trust subject and job are an optional v2 addition for a workflow-run trail.
3. **`local`**: the patch becomes a real persona commit on the mirror's branch `local`, on top of `demo-baseline` (see [Git flow on the local mirror](#git-flow-on-the-local-mirror)). The developer's working tree, index and branches are never touched.
4. **Record**: T0 in UTC, the Argo CD sync revision and time, and Coralogix deep links for the window, in `workshop/runs/<run-id>.json`.

The injector emits **no** telemetry of its own. Participants see only what a real change would leave behind.

**`lab-reset` behaviour**:

1. **Scenario reset, before the branch reset** (`reset.sh`): steps that need the scenario's state.
   - Delete import batches (INC-5).
   - Clear consumer lag. This needs an inactive group, so `reset.sh`:
     1. pushes a temporary `lab/live` commit setting media-worker `replicas: 0`;
     2. waits for the pod to exit;
     3. runs `kafka-consumer-groups --group demo-cms-media-worker --topic media.uploaded --reset-offsets --to-latest --execute`.
2. **Branch reset**: `git push --force-with-lease origin lab-baseline-<date>:lab/live` (`lab`), or re-publish the clean snapshot (`local`). This also restores the worker and removes any KEDA pause annotation.
3. **Terraform**: re-apply from the baseline if the scenario changed it.
4. **Converge**: hard refresh; wait for Synced/Healthy, CNPG healthy, and cms-backend back at 2 replicas.
5. Run WF1.

Target: ≤ 10 min. INC-7 is excluded because node group replacement takes about 20 min.

## Guardrails (WF5, in CI)

- `kustomize build` of `overlays/dev` and `overlays/prod` must not render:
  - `ScaledObject`, `TriggerAuthentication`;
  - any `postgresql.cnpg.io/*` kind;
  - `caption-stub`, `lab-traffic`, `lab-seed`.
- Every workshop ApplicationSet has `workshop: "true"` in its cluster selector. `envs/dev` and `envs/prod` gitops variables must not set that label.
- CI rejects pull requests from `lab/*` into `main`; `lab/live` is unprotected so the injector can force-push.
- gitleaks scans `workshop/`; persona e-mail addresses use `.invalid`.
- The query key (`coralogix-query`) has metrics-read scope on the workshop team only and is rotated after every workshop.

## Verification

- WF1–WF6 as defined in [incident-workshop.md](../architecture/incident-workshop.md#fitness-functions).
- Platform-specific checks:
  1. Argo CD shows `cms-backend` Synced while KEDA changes replicas (no replica fight).
  2. `kubectl auth can-i` as `oncall-sam`: allowed only for the three patch targets.
  3. k6 holds 30 rps ± 5 % with p95 < 150 ms for 15 min on `local` and `lab`.
  4. Consumer lag stays < 20 with the caption stub and loadgen running for 30 min.
