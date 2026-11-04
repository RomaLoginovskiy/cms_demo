# Coralogix objects for the cms-demo incident demo

> **Superseded on 2026-11-03.** These objects are managed by the Terraform stack
> [`infra/terraform/stacks/observability`](../../../infra/terraform/stacks/observability/), which adopted
> the live objects with their IDs. Change them there and run
> `make tf ENV=local STACK=observability CMD=apply` (see [infra/README.md](../../../infra/README.md)).
> The files below are the history of how they were first created and are out of date: the router now
> targets connector `slack-prod-alerts` (no preset), and the live dashboard has an "Ops events"
> annotation. `apply.sh` refuses to run unless `LEGACY_APPLY=1`.

Scope and context: [spec/architecture/incident-demo-scope-2026-11-03.md](../../../spec/architecture/incident-demo-scope-2026-11-03.md).

| File | Creates |
|---|---|
| `connector-slack-production-alerts.json` | Slack connector `slack-production-alerts` → channel `#production-alerts`. It reuses the Slack integration of an existing connector, so no ID is stored here |
| `dashboard-cms-api.json` | dashboard `cms-demo · API health (cms-local)`: API p95, requests/s by route, error ratio, DB p95, cms-backend replicas, CPU cores, CPU throttling |
| `alert-cms-api-p95.json` | P1 metric alert `[cms-local] CMS API p95 latency > 150 ms` on APM span metrics. Owning team `cms-platform` (entity label `team`), dashboard URL in the description, routed through Notification Center to the connector above |
| `alert-cms-postgres-fatal.json` | P1 logs alert `[cms-local] cms-postgres FATAL errors > 10 in 5 min`: PostgreSQL FATAL logs of `cms-demo/cms-postgres` (shutdown, `too many clients already`, terminated connections; baseline 0). Same team labels and routing as the p95 alert |
| `apply.sh` | creates the connector, router, dashboard and both alerts in order, wires the IDs, reuses objects that already exist (by name), then prints a verification |

## Prerequisites

- **cx CLI**: profile `default` (team watcher, eu1). Override with `CX_PROFILE_NAME`.
- **Slack**: the Coralogix Slack app is a member of `#production-alerts`.
- **cx-tam guard**: the plugin's read-only hook blocks every `cx` create inside Claude Code. Turn it off only for this step, and back on afterwards:

  ```bash
  sed -i '' 's/"cx-tam@cx-tam": true/"cx-tam@cx-tam": false/' ~/.claude/settings.json
  ```

  ```bash
  sed -i '' 's/"cx-tam@cx-tam": false/"cx-tam@cx-tam": true/' ~/.claude/settings.json
  ```

  Plugin hooks load when a session starts, so open a new Claude Code session after changing it.

## Run

```bash
DRY_RUN=1 bash workshop/demo/coralogix/apply.sh
```

```bash
bash workshop/demo/coralogix/apply.sh
```

The dry run reads only (with `--read-only`) and prints the rendered payloads. The real run prints the dashboard URL, and for each alert its URL, priority, team label and description.

## Undo

Disable rather than delete:

```bash
cx -p default alerts disable <alert-id>
```

Delete the dashboard and the connector in the UI, or with `cx … delete <id> --yes`.
