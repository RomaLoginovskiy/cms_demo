# ADR-025: Coralogix Annotations for CI/CD, Argo CD and Infrastructure Changes

**Status**: Proposed  
**Date**: 2026-11-02  
**Amends**: [ADR-024](ADR-024-investigation-telemetry.md) decision 4 (change events) · **Related**: [ADR-017](ADR-017-aws-eks-gitops-platform.md), [ADR-019](ADR-019-workload-identity-irsa.md)  
**Spec**: [coralogix-annotations.md](../components/coralogix-annotations.md)

## Context

Coralogix **annotations** are vertical markers on APM, Explore and dashboard charts. Each marker links to the change behind it: the pipeline run, the repository, the commit. Facts from the Coralogix documentation (annotations guide and the GitHub / Argo CD "Send deployment events" pages, revision of 2026-10-27):

- The only source is the **ops-events ingest API**: `POST https://api.<domain>/v1/ops-events` (REST) or `OpsEventsIngestService/CreateOpsEvent` (gRPC). Events also land in the `default/ops.events` dataset, so DataPrime can query them.
- There are two kinds of event:
  - `cdEvent`: pipeline and VCS fields. It draws as **Deployments**, with chart actions to open the pipeline run or the repository and to copy the commit SHA.
  - `customEvent`: a generic event. It draws as **Custom events**; Coralogix lists configuration changes here.
- The key is a Send-Your-Data key with the **OpsEvents** role preset; any other preset gets `403`. It can only post events.
- The timestamp must be within 24 hours of receipt, so events are sent live and never backfilled.
- Service-scoped display matches `attributes.service.name` and `attributes.environment` against the service's `service.name` and `deployment.environment.name`.

Gaps in cms-demo today:

- Nothing is sent.
- The backends report `deployment.environment` = `Production` (from `ASPNETCORE_ENVIRONMENT`) in every cluster, and no `deployment.environment.name` at all.
- ADR-024 decision 4 planned change events as **logs**: Argo CD Notifications through the in-cluster agent, and Terraform through a send-only logs key. It rejected a key in `argocd` because that would spread the ingest key. Logs do not draw on charts, and the collector cannot export to the ops-events API.

## Evaluation Criteria

- Chart correlation: the change appears on the affected service's charts.
- Commit traceability: every event leads to a real commit.
- Secret hygiene: the ingest key stays readable only from `observability` (aws-eks-platform.md §10).
- floci parity.
- Failure isolation: an annotation never fails a build, sync or apply.
- Maintenance cost.

### Options scorecard (1 = worst, 5 = best)

| Decision area | Options (score) | Chosen |
|---|---|---|
| Transport | ops-events API, direct (5).<br>Logs through the agent (2): no chart markers.<br>Both (3): two schemas for one fact | **ops-events** |
| Argo CD key | Dedicated OpsEvents key in `argocd`, through a new store whose role reads only that secret (5).<br>Add `argocd` to the `observability-secrets` store (1): `argocd` could then read the ingest key.<br>A relay workload in `observability` (2): a new component | **Dedicated store** |
| CI key | GitHub secret `CX_OPS_EVENTS_API_KEY` (4): works for `ci.yml` and `images.yml`, which have no AWS role; the key can only post events.<br>Secrets Manager through OIDC (3): IAM changes for three roles plus a new one for `ci.yml` | **GitHub secret** |
| Deployment granularity | One event per APM service per sync (5): appears in each service drilldown.<br>One event per Application without a service (2): appears under *All events* only | **Per service** |
| Infrastructure change kind | `customEvent` with commit fields in `additional` (4): its own legend entry, and the documented kind for configuration changes.<br>`cdEvent` (3): chart actions, but mixed in with application deployments | **`customEvent`** |
| Terraform hook | Inside `tf.sh` (5): CI, operator and floci applies alike, in one place.<br>A workflow step only (2): misses the operator-applied `gitops` stack | **`tf.sh`** |

## Decision

1. **Sender**: [`infra/scripts/ops-event.sh`](../../infra/scripts/ops-event.sh) (bash, curl, jq) builds `cd`, `custom` and `terraform` events.
   - It takes the commit context from GitHub Actions, or from the local checkout.
   - It never fails its caller: a missing key or a rejected request is a warning.
   - The key travels in a private header file, never on the command line.
2. **Event catalog**:

   | Source | When | Kind | `service.name` | `environment` |
   |---|---|---|---|---|
   | `images.yml` build job | each image built on `main` | `cdEvent` BUILD | the image's APM service (three backends); none for frontends and `canvas-load` | — |
   | `ci.yml` `annotate` job | each push to `main` (not pull requests, not cancelled runs) | `cdEvent` TEST | — | — |
   | Argo CD, app `cms-demo-<env>` | sync ends Healthy, Degraded or failed; once per revision and outcome | `cdEvent` DEPLOY (`CD_SYSTEM_ARGOCD`), one per APM service | `demo-cms-api`, `demo-cms-media-worker`, `demo-canvas-api` | overlay env |
   | Argo CD, `platform` and root apps | sync succeeds or fails; once per revision set | `customEvent`, category `platform-config` | — | env |
   | `tf.sh` apply or destroy (CI `terraform.yml`, operator, floci) | something changed, or the run failed | `customEvent`, category `infrastructure` | — | env |

3. **Correlation contract**:
   - Every event carries the full commit SHA: `cdEvent.vcs.ref.head.revision` on `cdEvent`s, and `attributes.additional.vcsRevision` on every event.
   - Every event shares the same `additional` keys (`origin`, `vcsRepository`, `vcsRef`, `vcsRevision`, `commitUrl`, `commitSubject`, `commitAuthor`, plus `actor` or `pipelineRunUrl` where known), so one DataPrime query covers all sources.
   - Build and deployment events share `imageTag` (`sha-<12 hex>`). A deployment event names the GitOps commit Argo CD synced, plus `sourceRevision` and `sourceCommitUrl` for the commit the image was built from.
   - Operator applies record `vcsDirty` when `infra/terraform` or `deploy/platform/argo-cd` has uncommitted changes.
4. **APM environment**: the three backends set `deployment.environment.name` through `OTEL_RESOURCE_ATTRIBUTES`.
   - The value comes from `build-info.DEPLOYMENT_ENVIRONMENT`, which equals the overlay name and Argo CD's `notifications.context.environment`.
   - The existing `deployment.environment` attribute is left unchanged, because existing queries may filter on it.
5. **Keys**:
   - Secrets Manager `cms-demo/<env>/coralogix-ops-events` (`API_KEY`): Terraform creates a placeholder, and the real value is written out of band, like the other keys.
   - ClusterSecretStore `argocd-secrets`: usable only from `argocd`, with IRSA role `eso_argocd`, which reads only that secret.
   - GitHub: secret `CX_OPS_EVENTS_API_KEY`, and optionally variable `CX_DOMAIN` (default `eu1.coralogix.com`).
   - floci: `CX_OPS_EVENTS_API_KEY` in `infra/local/.secrets.env`.
6. **Amendment to ADR-024 decision 4**:
   - For Argo CD syncs and Terraform applies, ops-events replace the planned `changes` logs. `default/ops.events` is queryable with DataPrime, so `change_timeline` can read it.
   - The planned logs key `coralogix-change-events` is not needed for these two sources.
   - CloudTrail and Kubernetes events are unchanged.

## Implications

- **Positive**:
  - "What changed?" is answered on the chart itself, for each service, environment and stack.
  - Every marker opens the run or the commit.
  - floci, `dev` and `prod` behave the same.
- **Negative / Risks**:
  - Argo CD drops a notification whose template fails, logging it in `argocd-notifications-controller` without retrying. `repo.GetCommitMetadata` fails that way when the repo server errors. The templates call it only for single-source apps, because it panics on `spec.sources`.
  - The three deployment templates repeat one body; only the first line differs.
  - Rollout order:
    1. `infra` apply (role and secret);
    2. `gitops` apply (cluster Secret annotation `irsa_role_arn_eso_argocd`);
    3. write the key.

    Until then the store cannot authenticate and Notifications posts are rejected. This is harmless.
  - A key stored in GitHub: it can only post events. Rotation happens in Coralogix and in the GitHub secret.
- **Follow-up actions**:
  - Create the OpsEvents key and write it to GitHub, Secrets Manager (`dev`) and `.secrets.env` (floci).
  - Confirm the first markers in APM (`demo-cms-api`, environment `dev`).
  - Confirm the `default/ops.events` field paths on the first real event, and update `change_timeline` in workshop-telemetry-detection.md.
  - Accept or reject the amendment to ADR-024.

## Consultation

- Coralogix docs: APM annotations; *Monitoring and insights → Annotations* (field reference); GitHub and Argo CD version-tags pages (*Send deployment events*).
- Argo CD v3.5.6 and notifications-engine source:
  - `oncePer` is an expr expression formatted with `%v`;
  - a default-subscription recipient without `:` is a webhook service with an empty recipient;
  - `repo.GetCommitMetadata` reads `spec.source`.
- argo-cd chart 10.11.6: `notifications.*` values are rendered with `toYaml` (no `tpl`), so template braces pass through.
