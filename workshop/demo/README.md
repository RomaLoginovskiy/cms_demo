# Incident demo (INC-1, Postgres-lite)

Runbook for the live demo in [the scope doc](../../spec/architecture/incident-demo-scope-2026-11-03.md). All commands run from the repository root on the presenter's Mac, with floci `cms-local` up.

| Path | What |
|---|---|
| `coralogix/` | alert, dashboard, Slack connector and router ([README](coralogix/README.md)) |
| `scripts/` | scenario scripts; they commit as personas to branch `local` of the local Git mirror, which Argo CD tracks |
| `load/api.js` | k6 open-model API load |
| `../../deploy/platform/coralogix-otel/overlays/local/aws-signal-emulator/` | emulated AWS CloudWatch metrics (EC2, EBS) from real node signals; dashboard row "AWS (emulated on floci)" |
| `investigator/` | Claude Code side by side: guide (`CLAUDE.md`), `prompt.md`, read-only RBAC and permissions |
| `../../deploy/apps/cms-demo/components/incident-postgres/` | `cms-postgres` and cms-backend on Postgres (local overlay only); the files the persona commits edit |

State (mirror clone, kubeconfig, watcher PID, logs) lives in `infra/local/.incident/` (git-ignored).

Step-by-step start and finish of the simulated incident, with preflight and troubleshooting: [incident-runbook.md](incident-runbook.md).

## Once, after `make local-all`

```bash
make local-sync                                  # publish the working tree incl. incident-postgres
workshop/demo/scripts/seed.sh                    # 300 text media + tags in cms-postgres
workshop/demo/scripts/baseline.sh                # tag the mirror tip as demo-baseline
workshop/demo/scripts/investigator.sh            # demo-viewer kubeconfig + GitOps history for Claude Code
workshop/demo/scripts/load.sh start 40           # k6 at 40 req/s against http://localhost:8080/api
```

Do not run `make local-sync` again during rehearsals or the demo: it replaces branch `local` with a working-tree snapshot. To change the baseline, publish, then re-run `baseline.sh`.

## Run

| When | Command | Effect |
|---|---|---|
| T−30 m | preflight (scope doc §6) | |
| T0 | `workshop/demo/scripts/inject.sh [cpu]` | Dana's FIN-142 commit: `cms-postgres` CPU limit 2 → `cpu` (default 60m); starts Sam's watcher |
| automatic | (watcher) | Sam's INC-1103 commit: cms-backend 2 → 8 once the P1 alert is firing on two checks 30 s apart (or the API probe is above 1 s twice), not before 150 s; timer fallback 420 s. Reads the alert with `cx alerts list`. Log: `infra/local/.incident/oncall.log` |
| fix | `workshop/demo/scripts/fix.sh` | one revert commit for both changes (or push Claude Code's revert) |
| after | `workshop/demo/scripts/reset.sh` | branch `local` back to `demo-baseline`; waits for Postgres and cms-backend |

**Annotations (ADR-025)**: every persona push (Dana, Sam, the fix) sends a Coralogix custom event at push time on `demo-cms-api`, environment `local`, carrying the commit's own author, subject and SHA (`annotate_push` in `scripts/lib.sh`, through `infra/scripts/ops-event.sh`). Argo CD Notifications then adds a Deployment marker for the same commit once the sync settles. Both need a valid OpsEvents key in `infra/local/.secrets.env` (`CX_OPS_EVENTS_API_KEY`); with a bad key both are dropped (Argo CD still records them as sent). Check the key:

```bash
( set -a; . infra/local/.secrets.env; set +a; infra/scripts/ops-event.sh custom --description "preflight annotation check" --environment local --service demo-cms-api )
```

Watcher tuning: `ONCALL_THRESHOLD_MS`, `ONCALL_MIN_WAIT`, `ONCALL_MAX_WAIT`, `ONCALL_REPLICAS`. Rehearse the database beat alone with `NO_ONCALL=1`.

## After a Docker Desktop restart

floci and its EKS, MSK and registry containers stay down, and the `localhost:8080` forward breaks. `workshop/demo/scripts/recover.sh` brings everything back (k3s cap 16.5 GiB), restarts the edge and k6, and leaves the mirror at `demo-baseline`. Takes about 5 minutes.

## Claude Code side by side

```bash
cd workshop/demo/investigator && claude
```

Paste the prompt from [`investigator/prompt.md`](investigator/prompt.md). `.claude/settings.local.json` (written by `investigator.sh`) points `KUBECONFIG` at the `demo-viewer` token (48 h) and `GITOPS_GIT_DIR` at the GitOps history.
