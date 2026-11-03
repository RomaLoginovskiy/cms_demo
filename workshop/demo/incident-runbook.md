# Simulated incident INC-1: start and finish

How to run the "right-sized into an outage" incident on the local floci cluster `cms-local`, and how to end it cleanly. The design and calibration are in [the scope doc](../../spec/architecture/incident-demo-scope-2026-11-03.md); the one-time setup is in [README.md](README.md).

Run every command from the repository root. `kubectl` commands need:

```bash
export KUBECONFIG=infra/local/.kubeconfig
```

## What the incident does

1. **T0, Dana's FinOps commit** (`inject.sh`): cuts the `cms-postgres` CPU limit from 2 cores to 60m ("right-size to observed usage, FIN-142"). Argo CD syncs it within 30 s and Postgres restarts on the new limit.
2. **T+1–2 min**: Postgres is throttled at its limit; DB and API latency climb to seconds. The P1 alert "[cms-local] CMS API p95 latency > 150 ms" fires and reaches Slack `#production-alerts`.
3. **T+2.5–7 min, Sam's on-call commit** (automatic): once the alert has been firing on two checks 30 s apart, Sam scales cms-backend 2 → 8 ("absorb latency, INC-1103"). Six new pods each open a pool of up to 20 connections against `max_connections=50`: errors jump (`53300 too many clients already`) and latency gets worse.
4. **Fix** (`fix.sh`, or the revert Claude Code proposes): one commit reverts both changes. Recovery takes about 1 minute; the alert resolves 6–8 minutes later.

Each push also sends a Coralogix annotation on `demo-cms-api` with the commit's author and subject (needs a valid OpsEvents key, see Preflight), and Argo CD adds a Deployment marker once the sync settles.

## Preflight (T−30 min)

| # | Check | Command | Expected |
|---|---|---|---|
| 1 | Cluster and apps | `kubectl -n argocd get applications` | all `Synced`, `Healthy` |
| 2 | Load running | `workshop/demo/scripts/load.sh status` | `cms-incident-k6 Up …`; if not: `workshop/demo/scripts/load.sh start 40` |
| 3 | Baseline state | `workshop/demo/scripts/watch.sh 1` | `pg limit=2`, `backend=2/2`, probe under ~100 ms |
| 4 | No earlier run applied | `ls infra/local/.incident/injected-at` | "No such file" |
| 5 | Alert quiet | `cx alerts list --name "CMS API p95 latency" -o json \| grep -o 'ALERT_DEF_STATUS_[A-Z_]*'` | `ALERT_DEF_STATUS_OK` |
| 6 | vLLM off | `kubectl -n llm scale deploy/vllm --replicas=0` | its CPU use shifts the calibrated knee |
| 7 | Node memory | `kubectl top node` | below ~12 GiB |
| 7b | Mac disk | `df -h /System/Volumes/Data` | 20 GiB or more free; a full disk crashes Docker Desktop and the whole cluster with it |
| 8 | Annotations | `( set -a; . infra/local/.secrets.env; set +a; infra/scripts/ops-event.sh custom --description "preflight annotation check" --environment local --service demo-cms-api )` | `annotation sent (2xx)`, not 403 |
| 9 | Claude Code access | `KUBECONFIG=infra/local/.incident/investigator.kubeconfig kubectl get pods -n cms-demo` | pods listed; if the token expired (48 h): `workshop/demo/scripts/investigator.sh` |
| 10 | Screens | Slack `#production-alerts`, the [dashboard](https://watcher.coralogix.com/dashboards/d4IsawufLdsXdj6trjkyx), a terminal for Claude Code | open |

Do not run `make local-sync` (or let another session run it) between preflight and the end of the demo: it replaces the GitOps branch the scenario commits to.

## Start the incident

1. Optional, recommended: a status pane in a spare terminal (one line every 15 s: Postgres limit and CPU, DB connections, cms-backend replicas, API probe):

   ```bash
   workshop/demo/scripts/watch.sh
   ```

2. Trigger it:

   ```bash
   workshop/demo/scripts/inject.sh
   ```

   It pushes Dana's commit, sends the push annotation and starts Sam's watcher in the background. Expected output ends with `injected: cms-postgres CPU limit 2 -> 60m` and `on-call watcher started`.

3. Follow along:

   | Where | What to look for |
   |---|---|
   | Status pane | `pg limit=60m`, probe in hundreds of ms to seconds; later `backend=…/8` |
   | Sam's log | `tail -f infra/local/.incident/oncall.log`: alert streak, then `on-call: cms-backend replicas 2 -> 8` |
   | Slack `#production-alerts` | the P1 page, 2–4 min after the inject; start the Olly thread there |
   | Claude Code | `cd workshop/demo/investigator && claude`, then paste the prompt from [prompt.md](investigator/prompt.md) with the alert time |
   | Coralogix | dashboard rows: API p95, error ratio, DB p95, Postgres CPU and throttling, replicas, AWS (emulated) |

Options:

| Need | Command |
|---|---|
| A different CPU cut | `workshop/demo/scripts/inject.sh 70m` (milder) |
| Database beat only, no scale-out | `NO_ONCALL=1 workshop/demo/scripts/inject.sh` |
| Scale-out sooner or later | `ONCALL_MIN_WAIT=…` (default 150 s), `ONCALL_MAX_WAIT=…` (timer fallback, default 420 s) |

## Finish the incident

1. Apply the fix: one revert commit for both changes, pushed to the mirror, with an annotation. Set your name as the author, otherwise it shows as "presenter":

   ```bash
   FIX_AUTHOR_NAME="Your Name" FIX_AUTHOR_EMAIL="you@example.com" workshop/demo/scripts/fix.sh
   ```

   If Sam has not scaled yet, `fix.sh` stops his watcher first and reverts only Dana's commit.

2. Watch recovery in the status pane: `pg limit=2`, `backend=2/2`, probe back to tens of ms within about a minute. On the dashboard, latency and errors drop at once; the P1 alert turns to resolved in Slack 6–8 minutes later.

3. Reset for the next run (also after a fix; it puts the GitOps branch back on its baseline and clears the run state):

   ```bash
   workshop/demo/scripts/reset.sh
   ```

   It takes about 30 s. Before the next `inject.sh`, wait until the alert is `OK` again (preflight check 5), otherwise there is no fresh Slack page and `inject.sh` warns.

To abort mid-incident without the fix narrative, run `reset.sh` directly: it stops Sam's watcher and restores the baseline.

## When something goes wrong

| Symptom | Cause | Action |
|---|---|---|
| `inject.sh`: "newer working-tree snapshot … run baseline.sh" | someone ran `make local-sync` | `workshop/demo/scripts/baseline.sh`, then inject |
| `inject.sh`: "not at demo-baseline … run reset.sh" | an earlier run is still applied | `workshop/demo/scripts/reset.sh` |
| `reset.sh`: "newer working-tree snapshot … resetting would undo it" | a `make local-sync` during the run already replaced the branch | `workshop/demo/scripts/baseline.sh` |
| No Slack page | alert still firing from an earlier run, or Slack delivery | check the alert in Coralogix; narrate from the dashboard |
| Total outage instead of slowdown (probe at the 10 s cap from the start) | laptop CPU busy (vLLM, builds) | `reset.sh`, free the CPU, retry; or `inject.sh 70m` |
| Sam never scales | alert not firing yet | the 420 s timer scales anyway; or skip the beat |
| `localhost:8080` refuses connections, cluster API down, floci containers exited | Docker Desktop restarted | `workshop/demo/scripts/recover.sh` (about 5 min) |
| `inject.sh`: "cluster cms-local does not answer" or "API … answers 000", or telemetry stopped | Docker Desktop restarted (on 2026-11-03: the Mac's disk was full) | free disk space, `workshop/demo/scripts/recover.sh`, then inject |
| Commits already pushed while the cluster was down (`oncall.log` shows probe 10000 ms from t+0) | same | `recover.sh`, then `reset.sh`, wait for the alert to be `OK`, then inject again |
| `inject.sh`: "cms-postgres still has limit 2 after 90 s" | Argo CD reports a stale `Synced` | `kubectl -n argocd annotate application cms-demo-local argocd.argoproj.io/refresh=hard --overwrite` |
| Annotation step prints 403 | OpsEvents key invalid | create a Send-Your-Data key with the OpsEvents preset, put it in `infra/local/.secrets.env`, run `make local-secrets` |

State of the current run lives in `infra/local/.incident/` (`injected-at`, `oncall.pid`, `oncall.log`); `reset.sh` clears it.
