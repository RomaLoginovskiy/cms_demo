# Component: GitOps with Argo CD

**Status**: Proposed (2026-10-30, revised after review)  
**Decisions**: [ADR-017](../adr/ADR-017-aws-eks-gitops-platform.md), [ADR-018](../adr/ADR-018-eks-edge-routing-gateway-api.md), [ADR-019](../adr/ADR-019-workload-identity-irsa.md)  
**Related**: [terraform-infrastructure.md](terraform-infrastructure.md), [cms-demo-workload-contract.md](cms-demo-workload-contract.md), [floci-local-environment.md](floci-local-environment.md)

## Responsibility

Argo CD (self-managed, 3.5.x) is the only writer of in-cluster state in every environment. It renders everything from `deploy/` in this repository. Environment-specific *identifiers* (account, role ARNs, certificate ARN, registry host, allowlist) arrive from Terraform through the Argo CD cluster Secret (GitOps Bridge pattern); environment-specific *intent* (replicas, components, hostnames, image tags) lives in Git overlays.

## Repository layout

```
deploy/
  argocd/                         # synced by the root Application created by Terraform
    projects/                     # AppProject platform, AppProject cms-demo
    applicationsets/              # one ApplicationSet per add-on + one for the app
  platform/
    namespaces/                   # cms-demo, edge, observability with PSA + route labels
    argo-cd/                      # values.yaml, values-<env>.yaml (self-management)
    external-secrets/             # values; stores/ (ClusterSecretStores + service accounts)
    reloader/                     # values
    envoy-gateway/                # values (controller deploy mode GatewayNamespace)
      base/                       #   GatewayClass, Gateway cms-edge, ClientTrafficPolicy, redirect route
      overlays/{local,aws}/       #   EnvoyProxy per runtime
    aws-load-balancer-controller/ # values (AWS only)
    external-dns/                 # values (AWS only)
    metrics-server/               # values (AWS only; k3s bundles its own)
    kube-state-metrics/           # values (allowlist: kube_pod_info, kube_node_info, … for APM correlation)
    node-exporter/                # values, values-local.yaml (floci: root mount propagation None)
    storage/                      # gp3 default StorageClass (AWS only)
    coralogix-otel/               # Kustomize helmCharts(otel-integration) + otel-agent Service + /v1/traces route
      base/                       #   + ExternalSecrets + HTTPRoute /v1/traces
      overlays/{local,dev,prod}/  #   local: mountPropagation patches (ex post-renderer.sh)
  apps/
    cms-demo/
      base/                       # one directory per service + storage, routes, network-policies, config
      components/
        loadgen/                  #   canvas-load StatefulSet, ConfigMap, Services (no route)
        rum-lag-sim/              #   ex k8s/patches/canvas-frontend-lag-env.json
        rum-large-board/          #   ex k8s/patches/canvas-frontend-large-board-env.json
      overlays/{local,dev,prod}/
```

## Bootstrap (created by Terraform `gitops-bootstrap`)

1. Namespace `argocd`; Helm release `argo-cd` (pinned chart, bootstrap values). Terraform ignores later changes; the `argo-cd` ApplicationSet adopts the release with the same chart and values.
2. Cluster Secret for `https://kubernetes.default.svc` with labels and annotations defined in [terraform-infrastructure.md](terraform-infrastructure.md#argo-cd-cluster-secret-gitops-bridge).
3. Root `Application` (project `default`, installed with the `argocd-apps` chart) → `deploy/argocd`, `targetRevision` = `gitops_revision`, automated sync with prune and self-heal. It creates the AppProjects and ApplicationSets; it cannot itself belong to a project it creates.

Everything else is reconciled from Git.

## AppProjects

| Project | Sources | Destinations | Cluster-scoped kinds |
|---|---|---|---|
| `platform` | this repository + the pinned chart repositories | any namespace | allowed (Namespaces, CRDs, ClusterRoles, GatewayClass, StorageClass, ClusterSecretStore, webhooks) |
| `cms-demo` | this repository | namespace `cms-demo` only | none; namespaced kinds only (the namespace itself comes from `platform/namespaces`) |

## ApplicationSets

Every ApplicationSet uses the **cluster generator** with Go templates (`goTemplate: true`, `missingkey=error`), so each cluster's Argo CD generates only what its labels select and fills values from its annotations. Paths use `{{.metadata.labels.environment}}`.

| ApplicationSet | Selector | Source | Destination | Notes |
|---|---|---|---|---|
| `namespaces` | all | `platform/namespaces` | — | `cms-demo` (PSA `baseline`, warn `restricted`, `edge.cms-demo/routes: "true"`), `edge` (`baseline`), `observability` (`privileged`, `edge.cms-demo/routes: "true"`) |
| `argo-cd` | all | Helm `argo-cd` + values from Git + `platform/argo-cd/notifications` | `argocd` | self-management; Notifications post Coralogix annotations (ADR-025, ExternalSecret `argocd-notifications-secret`); `SkipDryRunOnMissingResource=true` |
| `external-secrets` | all | Helm + `platform/external-secrets/stores` | `external-secrets` | service accounts `eso-app` / `eso-observability` / `eso-argocd` annotated with `irsa_role_arn_eso_app` / `irsa_role_arn_eso_observability` / `irsa_role_arn_eso_argocd`; ClusterSecretStores (region from `aws_region`) with namespace `conditions`; locally `AWS_STS_ENDPOINT`, `AWS_SECRETSMANAGER_ENDPOINT`, `AWS_SSM_ENDPOINT` = `aws_endpoint_url`; `SkipDryRunOnMissingResource=true` |
| `reloader` | all | Helm | `reloader` | watches annotated workloads |
| `envoy-gateway` | all | Helm `gateway-crds-helm` + Helm `gateway-helm` (`deploy.type: GatewayNamespace`) + `platform/envoy-gateway/overlays/{{if eq .metadata.labels.cloud "aws"}}aws{{else}}local{{end}}` | `envoy-gateway-system`, `edge` | AWS `EnvoyProxy`: NLB class, annotations and `loadBalancerSourceRanges` templated from `acm_certificate_arn` and `public_ingress_cidrs` |
| `aws-load-balancer-controller` | `cloud=aws` | Helm | `kube-system` | `clusterName`, `vpcId`, `region` from annotations (IMDS hop limit 1 hides them); Gateway API feature gates off; `ignoreDifferences` + `RespectIgnoreDifferences=true` for the webhook TLS Secret data and the webhook configurations' `caBundle` (the chart generates its certificate at render time) |
| `external-dns` | `cloud=aws` | Helm | `external-dns` | source `gateway-httproute`, domain filter `route53_zone_name`, policy `sync`, owner ID = cluster name |
| `metrics-server` | `cloud=aws` | Helm | `kube-system` | k3s already bundles metrics-server; installing a second copy on floci collides on the Deployment selector and the APIService |
| `kube-state-metrics` | all | Helm (prometheus-community) + values from Git | `observability` | scraped by the Coralogix cluster collector (`prometheus/ksm`); Coralogix APM joins spans to `kube_pod_info` / `kube_node_info` |
| `node-exporter` | all | Helm `prometheus-node-exporter` + `values.yaml` + `values-{{environment}}.yaml` (`ignoreMissingValueFiles`) | `observability` | hostNetwork DaemonSet; the cluster collector discovers its pods (`prometheus/node-exporter`, host-level `node_*` families only) and copies `service.instance.id` back to `instance`, which APM matches against the node internal IP |
| `storage` | `cloud=aws` | `platform/storage` | — | default `gp3` class |
| `coralogix-otel` | all | `platform/coralogix-otel/overlays/{{.metadata.labels.environment}}` | `observability` | Kustomize `--enable-helm` |
| `cms-demo` | all | `apps/cms-demo/overlays/{{.metadata.labels.environment}}` | `cms-demo` (project `cms-demo`) | registry host from `ecr_registry`; local tag override (below); components (load generator, RUM scenarios) chosen by each overlay |

Illustrative shape (not final):

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: external-secrets
  namespace: argocd
spec:
  goTemplate: true
  goTemplateOptions: ["missingkey=error"]
  generators:
    - clusters:
        selector:
          matchLabels:
            argocd.argoproj.io/secret-type: cluster
  template:
    metadata:
      name: 'external-secrets-{{.metadata.labels.environment}}'
    spec:
      project: platform
      sources:
        - repoURL: https://charts.external-secrets.io
          chart: external-secrets
          targetRevision: 2.14.0
          helm:
            releaseName: external-secrets
            valueFiles:
              - $values/deploy/platform/external-secrets/values.yaml
        - repoURL: '{{index .metadata.annotations "gitops_repo_url"}}'
          targetRevision: '{{index .metadata.annotations "gitops_revision"}}'
          ref: values
        - repoURL: '{{index .metadata.annotations "gitops_repo_url"}}'
          targetRevision: '{{index .metadata.annotations "gitops_revision"}}'
          path: deploy/platform/external-secrets/stores
      destination:
        server: '{{.server}}'
        namespace: external-secrets
      syncPolicy:
        automated: { prune: true, selfHeal: true }
        syncOptions: [CreateNamespace=true, ServerSideApply=true, SkipDryRunOnMissingResource=true]
        retry:
          limit: 10
          backoff: { duration: 10s, factor: 2, maxDuration: 5m }
```

Role ARNs, region and the floci endpoint variables are injected with `templatePatch` (Go-template conditionals on the presence of `aws_endpoint_url`), so AWS clusters never carry emulator settings.

## Ordering

Argo CD does not order Applications generated by ApplicationSets (progressive sync is not a default feature). Convergence therefore relies on:

- CRDs shipped by a chart that owns them (`gateway-crds-helm` on the standard channel, which k3s 1.37 pre-installs identically; ESO's chart), applied with `ServerSideApply=true`.
- AppProjects carry `argocd.argoproj.io/sync-wave: "-1"` in the root Application, so ApplicationSets never generate Applications for a project that does not exist yet (seen on the first floci boot).
- Custom resources that may arrive before their CRD carry `SkipDryRunOnMissingResource=true`.
- Retries with exponential backoff on every Application; the `cms-demo` Application simply retries until `platform/namespaces` has created its namespace.
- Sync waves **inside** the `cms-demo` Application. Every resource in a wave must be healthy before the next wave starts, which drives the placement below:

| Wave | Resources | Why here |
|---|---|---|
| -2 | ServiceAccounts, ConfigMaps, ExternalSecrets | ExternalSecret health (built into Argo CD) gates the Jobs and pods that read their Secrets; placeholders guarantee they resolve |
| -1 | `kafka-topics` Job (`hook: Sync`, `hook-delete-policy: BeforeHookCreation`, idempotent `--if-not-exists`) | needs the `app-endpoints` Secret |
| 0 | PVCs, Deployments, StatefulSet, Services | PVCs bind only when their consumer pod is scheduled (`WaitForFirstConsumer`), so they must share a wave with it |
| 1 | HTTPRoutes, Envoy Gateway policies, NetworkPolicies | routes attach after backends exist |

Expected first-boot time on an empty cluster: under 10 minutes (fitness function F2 in the floci spec).

## App packaging and overlays

`base/` is environment-agnostic: image names are bare (`cms-backend`, `media-worker`, …), no registry, no tag, no hostnames, no floci addresses, no `storageClassName`.

| Setting | `local` | `dev` | `prod` |
|---|---|---|---|
| Image registry | `ecr_registry` annotation (floci ECR, path style) | `ecr_registry` (ECR) | `ecr_registry` (ECR) |
| Image tags | cluster annotation `image_tag_override` set by `make local-images` | Git overlay, written by the promote-dev PR | Git overlay, manual promotion PR |
| Replicas | 1 everywhere | stateful tiers 1, frontends 2 | frontends 2–3 (+ HPA) |
| Resources | reduced requests | base | base |
| `CORALOGIX_ENVIRONMENT` | `local` | `dev` | `production` |
| Components | `loadgen` | `loadgen` (Q6) | none |
| Load generator target | `http://cms-edge.edge.svc.cluster.local:443` (Gateway, plain HTTP inside the cluster) | `https://cms-dev.<domain>` (public path, via NAT; NAT EIPs are in the allowlist) | — |
| AWS endpoint override | `AWS_ENDPOINT_URL=http://floci:4566` (only where an SDK is used) | — | — |
| Route hostnames | none (match all) | `cms-dev.<domain>` | `cms.<domain>` |

## Secrets and configuration

Two `ClusterSecretStore`s, each with its own service account and IRSA role (ADR-019), both restricted by `spec.conditions` to the namespaces that need them:

| Store | Service account | Usable from | Reads |
|---|---|---|---|
| `aws-app` | `eso-app` | `cms-demo` | SM `cms-demo/<env>/coralogix-rum`, `cms-demo/<env>/llm`; SSM `/cms-demo/<env>/{kafka,app,llm}/*` |
| `aws-observability` | `eso-observability` | `observability` | SM `cms-demo/<env>/coralogix-ingest`; SSM `/cms-demo/<env>/kafka/*` |
| `argocd-secrets` | `eso-argocd` | `argocd` | SM `cms-demo/<env>/coralogix-ops-events` only (annotations key, ADR-025) |

| ExternalSecret | Namespace | Store | Resulting Secret keys | Consumed as |
|---|---|---|---|---|
| `coralogix-keys` | `observability` | `aws-observability` | `PRIVATE_KEY` | Coralogix chart (unchanged key name) |
| `rum-keys` | `cms-demo` | `aws-app` | `CORALOGIX_RUM_PUBLIC_KEY` | both frontends |
| `app-endpoints` | `cms-demo` | `aws-app` | `KAFKA_BOOTSTRAP_SERVERS`, `KAFKA_REPLICATION_FACTOR`, `PUBLIC_ORIGIN`, `LLM_BASE_URL`, `LLM_MODEL` | backends, worker, topics Job |
| `llm-api-key` | `cms-demo` | `aws-app` | `OPENAI_API_KEY` | media-worker `OpenAI__ApiKey` |
| `argocd-notifications-secret` | `argocd` | `argocd-secrets` | `coralogix-ops-events-token` | Argo CD Notifications webhook `coralogix-ops-events` |

`refreshInterval: 1h`. ESO rewrites a Secret when its source changes, but Argo CD tracks only the ExternalSecret, so env-var consumers would keep stale values; every consuming Deployment/StatefulSet therefore carries `reloader.stakater.com/auto: "true"` and Reloader rolls it.

## Delivery and promotion

- Image tags are immutable `sha-<12 hex>`; build jobs skip tags that already exist (ECR rejects even an identical re-push to an immutable tag).
- `dev`: after `images.yml` pushes, a promotion job opens a PR that runs `kustomize edit set image` in `overlays/dev` (plus the `APP_VERSION` literal) **with a GitHub App installation token** (PRs created with `GITHUB_TOKEN` trigger no workflow runs, so required checks would never report), then enables auto-merge. Argo CD polls every 3 minutes; no inbound webhook is needed while the UI stays private.
- `prod`: a human PR copies the tag set from `overlays/dev` to `overlays/prod`; branch protection requires review.
- `local`: `make local-images` builds and pushes to floci ECR, then annotates the local cluster Secret with `image_tag_override=<tag>`; the `cms-demo` ApplicationSet's `templatePatch` applies it (local only). Terraform ignores that annotation. Git stays clean.
- Local Git source: the `local` cluster reads a working-tree snapshot from a local Git mirror (`make local-sync`), so unpushed changes reach Argo CD without publishing them; `make local-retarget BRANCH=<name>` switches it to a pushed GitHub branch by updating the `gitops_repo_url`/`gitops_revision` annotations and the root app.

## Sync and safety settings

- Automated sync with `prune: true`, `selfHeal: true` everywhere; `prod` keeps self-heal and humans only get read-only Kubernetes access.
- PVCs carry `argocd.argoproj.io/sync-options: Prune=false,Delete=false`; the `gp3` StorageClass uses `reclaimPolicy: Retain` in `prod`.
- Argo CD settings via its own values: `kustomize.buildOptions: --enable-helm`, `server.insecure: true` (TLS ends at the edge or at the port-forward), single replicas in `local`/`dev`, HA values in `prod`. The local admin account stays enabled until SSO (phase 4); the UI is reachable only through `kubectl port-forward` until then.
- Imperative changes are not used on EKS: `deploy.sh`, `kubectl set image/env`, and manual `helm upgrade` are retired; drift is reverted by self-heal.

## Migration map from `k8s/` and `coralogix/`

| Current file | Destination | Required change |
|---|---|---|
| `k8s/namespace.yaml` | `platform/namespaces/` | PSA labels; route label `edge.cms-demo/routes: "true"` |
| `k8s/backend-deployment.yaml` | `apps/cms-demo/base/cms-backend/` | bare image name; `strategy: Recreate`; env from `app-endpoints`; `MediaEvents__PublicBaseUrl=http://cms-backend:8080`; Reloader annotation |
| `k8s/media-worker-deployment.yaml` | `apps/cms-demo/base/media-worker/` | bare image; Kafka and LLM settings from ExternalSecrets |
| `k8s/frontend-deployment.yaml` | `apps/cms-demo/base/cms-frontend/` | bare image; RUM key from `rum-keys`; env name/version via overlay |
| `k8s/canvas-backend-deployment.yaml` | `apps/cms-demo/base/canvas-backend/` | bare image; `strategy: Recreate`; `Cors__Origin` from `PUBLIC_ORIGIN` |
| `k8s/canvas-frontend-deployment.yaml` | `apps/cms-demo/base/canvas-frontend/` | bare image; RUM key from `rum-keys` |
| `k8s/persistent-volumes.yaml` | `apps/cms-demo/base/storage/` | wave 0; prune/delete protection; no storage class; declared in Git instead of created by `deploy.sh` |
| `k8s/ingress.yaml` | `apps/cms-demo/base/routes/` (+ `/v1/traces` route in `platform/coralogix-otel`) | HTTPRoutes per ADR-018 |
| `k8s/network-policy.yaml` | `apps/cms-demo/base/network-policies/` | allow from namespace `edge` (where the Envoy proxies run) instead of `ingress-nginx` |
| `k8s/kafka-deployment.yaml` | removed | MSK / floci MSK + `kafka-topics` Job (ADR-020) |
| `k8s/otel-agent-service.yaml` | `platform/coralogix-otel/base/` | namespace `observability`; key from an ExternalSecret. `k8s/otel-gateway-*.yaml` is not ported: on EKS the agent ships logs directly (Q7) |
| `coralogix/values.yaml` | `platform/coralogix-otel/base/values.yaml` + overlay values | `clusterName` per environment; Kafka brokers via env var |
| `coralogix/post-renderer.sh` | `platform/coralogix-otel/overlays/local/` patches | applied only on floci |
| `k8s/canvas-load-{configmap,statefulset}.yaml` | `apps/cms-demo/components/loadgen/` | bare image; target URL per overlay |
| `k8s/canvas-load-service.yaml` | `apps/cms-demo/components/loadgen/` | **`type: ClusterIP`** (was `LoadBalancer`, which would publish an unauthenticated control API) |
| `k8s/canvas-load-ingress.yaml` | dropped | admin UI via `kubectl port-forward` only (ADR-018) |
| `k8s/canvas-load-network-policy.yaml` | stays opt-in, not in any overlay | it blocks browser RUM egress to Coralogix |
| `k8s/patches/*.json` | `apps/cms-demo/components/rum-*` | Kustomize components |
| `k8s/canvas-load-deployment.yaml`, `k8s/vmagent_deployment.yaml` (empty), `k8s/overlays/*` (empty) | deleted | legacy |
| `k8s/deploy.sh` | retired for EKS; kept for Docker Desktop until `local` on floci replaces it | — |

## Verification

1. CI renders every overlay (`kustomize build --enable-helm`) and validates with `kubeconform` including CRD schemas (Gateway API, Envoy Gateway, ESO, Argo CD).
2. After bootstrap, all Applications are `Synced/Healthy` within 10 minutes (floci and `dev`).
3. Drift test: scaling `cms-frontend` to 0 by hand is reverted within one reconciliation.
4. Promotion test: a new tag in `overlays/dev` reaches running pods without any manual step.
5. Edge test: `POST /v1/traces` through the Gateway reaches the collector (2xx/4xx from the collector, not a 404 from Envoy).
