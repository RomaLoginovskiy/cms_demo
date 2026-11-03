# Component: Coralogix Annotations (ops-events)

**Decision**: [ADR-025](../adr/ADR-025-coralogix-annotations.md) · **Status**: implemented; Argo CD events verified on floci 2026-11-03 (three `cdEvent`s per `cms-demo-local` sync and a platform `customEvent` in `default/ops.events`, team watcher, eu1). A key without the OpsEvents preset gets `403` with an empty body. The deploy trigger needs `cms-demo-<env>` Healthy, so a crash-looping pod (for example an OOMKilled `canvas-load`) suppresses deploy events.

Every build, test run, deployment and infrastructure change of cms-demo is posted to the Coralogix ops-events API. It then shows as an annotation on APM, Explore and dashboard charts, and is stored in `default/ops.events`.

## Producers

| Producer | Code | Kind | Fires |
|---|---|---|---|
| Image builds | `.github/workflows/images.yml`, step *Annotate the build* | `cdEvent`, task `build <image>`, type BUILD | each image built on `main`; skipped when the tag already exists |
| CI result | `.github/workflows/ci.yml`, job `annotate` | `cdEvent`, task `ci`, type TEST | each push to `main`; status `failure` if any job failed |
| Application deploys | `deploy/platform/argo-cd/values.yaml`, trigger `coralogix-cms-demo` | `cdEvent` (`CD_SYSTEM_ARGOCD`), task `sync`, type DEPLOY; one per APM service | `cms-demo-<env>` sync Succeeded and Healthy (catalog timing check), Succeeded but Degraded, or Error/Failed; once per revision and outcome |
| Platform config | same file, trigger `coralogix-platform` | `customEvent`, `category=platform-config` | a `platform` or root (`default` project) app sync Succeeded or Error/Failed; once per revision set (multi-source: all revisions) |
| Terraform | `infra/local/scripts/tf.sh` → `ops-event.sh terraform` | `customEvent`, `category=infrastructure` | `apply`/`destroy` that changed something or failed; no-op and cancelled runs are skipped (`CX_OPS_EVENTS_NOOP=1` sends no-ops too) |

APM service mapping (image → `service.name`): `cms-backend` → `demo-cms-api`, `media-worker` → `demo-cms-media-worker`, `canvas-backend` → `demo-canvas-api`. Frontends and `canvas-load` have no APM service, so their build events carry no service.

## Payload

Common `attributes.additional` keys (strings, empty values dropped by the script):

| Key | Meaning |
|---|---|
| `category` | `build`, `test`, `deployment`, `platform-config`, `infrastructure` |
| `origin` | `github-actions`, `operator`, `argocd` |
| `vcsRepository`, `vcsRef`, `vcsRevision` | repository (https), branch, full commit SHA |
| `commitUrl`, `commitSubject`, `commitAuthor` | the commit (Argo CD: from the repo server; single-source apps only) |
| `actor`, `pipelineRunUrl` | who ran it; the GitHub run (CI only) |
| `vcsDirty` | operator runs: uncommitted changes under `infra/terraform` or `deploy/platform/argo-cd` |
| `imageTag` | `sha-<12 hex>`: the same value on the build event and the deploy event |
| `sourceRevision`, `sourceCommitUrl` | deploy events: the commit the image was built from (from the tag) |
| `argocdApp`, `argocdProject`, `argocdUrl`, `syncPhase`, `health`, `sources` | Argo CD events |
| `stack`, `action`, `result`, `added`, `changed`, `destroyed`, `imported`, `resources`, `error` | Terraform events; `resources` lists `+created`, `~updated`, `-destroyed` addresses (first 25) |

Deployment event from Argo CD (rendered by the harness below):

```json
{"opsEvent": {
  "timestamp": "2026-11-02T10:00:20Z",
  "description": "demo-cms-api sha-1a2b3c4d5e6f deployed to dev",
  "attributes": {"service": {"name": "demo-cms-api"}, "environment": "dev",
    "additional": {"category": "deployment", "origin": "argocd", "imageTag": "sha-1a2b3c4d5e6f",
      "sourceCommitUrl": "https://github.com/RomaLoginovskiy/cms_demo/commit/1a2b3c4d5e6f",
      "vcsRevision": "9f8e7d6c…", "commitSubject": "deploy(dev): sha-1a2b3c4d5e6f", "…": "…"}},
  "cdEvent": {"system": "CD_SYSTEM_ARGOCD",
    "pipeline": {"name": "cms-demo-dev", "run": {"id": "9f8e7d6c…", "url": "https://argocd.cms-demo.internal/applications/cms-demo-dev"},
      "result": {"status": "PIPELINE_RESULT_STATUS_SUCCESS"}, "task": {"name": "sync", "type": "PIPELINE_TASK_TYPE_DEPLOY"}},
    "vcs": {"system": "VCS_SYSTEM_GITHUB", "type": "VCS_REF_TYPE_BRANCH",
      "repository": {"name": "RomaLoginovskiy/cms_demo", "url": "https://github.com/RomaLoginovskiy/cms_demo"},
      "ref": {"head": {"name": "main", "revision": "9f8e7d6c…"}}}}}}
```

Terraform event: description `Terraform apply dev/infra: 2 added, 1 changed, 0 destroyed` (or `… failed: <first error line>`), `environment=dev`, `customEvent: {}`.

## Sender: `infra/scripts/ops-event.sh`

```bash
infra/scripts/ops-event.sh cd --task-type build --task-name "build cms-backend" --status success \
  --service demo-cms-api --description "…" --extra imageTag=sha-…      # GitHub Actions only
infra/scripts/ops-event.sh custom --description "…" --environment dev --extra key=value
infra/scripts/ops-event.sh terraform --env dev --stack infra --action apply --exit-code 0 --log apply.log
```

| Variable | Default | |
|---|---|---|
| `CX_OPS_EVENTS_API_KEY` | — | unset: logs "not sent" and exits 0 |
| `CX_DOMAIN` / `CX_OPS_EVENTS_URL` | `eu1.coralogix.com` → `https://api.eu1.coralogix.com/v1/ops-events` | |
| `CX_OPS_EVENTS_DRY_RUN=1` | off | prints the event instead of sending |

Exit codes: 0 for sent, skipped or rejected (rejections are warnings, `::warning::` in Actions); 2 for usage errors. Workflow steps also set `continue-on-error: true`.

## Argo CD Notifications

- Enabled in `deploy/platform/argo-cd/values.yaml` (shared by the Terraform bootstrap and the self-managing `argo-cd` ApplicationSet):
  - webhook service `coralogix-ops-events` (platform events) plus `coralogix-ops-events-{cms-api,media-worker,canvas-api}`, one per deploy template: a trigger's templates merge into one notification keyed by webhook name, so templates sharing a name overwrite each other and only the last would be sent;
  - templates `coralogix-deploy-{cms-api,media-worker,canvas-api}` and `coralogix-config-change`;
  - triggers `coralogix-cms-demo` and `coralogix-platform`;
  - default subscriptions for every Application (`coralogix-platform` → `coralogix-ops-events`, `coralogix-cms-demo` → the three per-service webhooks), so Applications need no annotations.
- `notifications.context`:
  - `environment` comes from `values-<env>.yaml` and must equal the workloads' `deployment.environment.name`;
  - `sourceRepoUrl` is the GitHub repository the images are built from, so local-mirror deploys still link to GitHub commits;
  - `argocdUrl` defaults to `https://<global.domain>`.
- Secret `argocd-notifications-secret` (key `coralogix-ops-events-token`) comes from ExternalSecret `deploy/platform/argo-cd/notifications`, the third source of the `argo-cd` ApplicationSet. Its store is `argocd-secrets`, and the chart's own secret is disabled.
- Templates call `repo.GetCommitMetadata` only when the app has `spec.source` and a revision. It panics on multi-source apps, and a panic drops the event.

## Workload attribute

`cms-backend`, `media-worker` and `canvas-backend` set:

- `DEPLOYMENT_ENVIRONMENT` from ConfigMap `build-info`, where each overlay sets the key to `local`, `dev` or `prod`;
- `OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=$(DEPLOYMENT_ENVIRONMENT)`. OpenTelemetry .NET reads this through its default resource detector.

## Setup

1. In Coralogix, create a Send-Your-Data key with the **OpsEvents** preset.
2. In GitHub, add secret `CX_OPS_EVENTS_API_KEY` (and variable `CX_DOMAIN` if the team is not on eu1).
3. AWS `dev`/`prod`:
   1. apply `infra` (secret placeholder, role `eso_argocd`);
   2. apply `gitops` (the cluster Secret gains `irsa_role_arn_eso_argocd`);
   3. write the key:
      ```bash
      aws secretsmanager put-secret-value --secret-id cms-demo/dev/coralogix-ops-events --secret-string '{"API_KEY":"..."}'
      ```
   For operator Terraform runs, export `CX_OPS_EVENTS_API_KEY`.
4. floci: put `CX_OPS_EVENTS_API_KEY` in `infra/local/.secrets.env` and run `make local-secrets`. `tf.sh` reads the same line for `env=local`. On an existing local cluster, run `make local-apply local-gitops` first.

## Verification

- **Sender**: `CX_OPS_EVENTS_DRY_RUN=1 infra/scripts/ops-event.sh …` prints the event. The Terraform parser was checked against apply, no-op, destroy, failure (boxed error) and cancelled outputs.
- **Argo CD config**: render the chart with the env's values, then evaluate the rendered `argocd-notifications-cm` with expr v1.17.8 and sprig v3.3.0 (the versions in Argo CD v3.5.6), using Argo CD's `repo`/`time` helpers. Fixtures checked:
  - healthy, stale-healthy, too-early and degraded `cms-demo` syncs;
  - a failed sync without `syncResult`;
  - no operation; no `summary`;
  - the local mirror with a dirty tag;
  - multi-source and single-source platform apps; the root app; a platform error.

  All rendered bodies are valid JSON with RFC 3339 timestamps.
- **Live** (pending a key):
  - `source default/ops.events | limit 10` shows the events; confirm field paths there.
  - APM → `demo-cms-api` → Annotations shows Deployments for environment `dev`.
  - On a failure, check `kubectl -n argocd logs deploy/argocd-notifications-controller`:
    - `403`: wrong key preset;
    - `401`: placeholder key;
    - template errors name the template.
