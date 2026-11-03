# Infrastructure

Terraform for AWS (and floci), plus the local AWS environment. Design: [spec/architecture/aws-eks-platform.md](../spec/architecture/aws-eks-platform.md); plan: [spec/architecture/aws-eks-delivery-plan.md](../spec/architecture/aws-eks-delivery-plan.md).

```
infra/
  terraform/
    modules/     network, eks, ecr, msk, app-config, edge-dns, github-oidc, budget, gitops-bootstrap
    stacks/      bootstrap (AWS state bucket), global (ECR, CI roles, budget), infra (VPC, EKS, MSK, config), gitops (Argo CD)
    envs/<env>/  backend.hcl + <stack>.tfvars   (local = floci, dev = AWS)
  local/         floci docker-compose.yml and scripts
  scripts/       ops-event.sh: Coralogix annotations (CI, tf.sh); spec/components/coralogix-annotations.md
  mk/            make targets (included by the root Makefile)
```

The same stack code runs against floci and AWS; only `envs/<env>/*` differs. Each environment gets its own Terraform data directory (`stacks/<stack>/.terraform-<env>`), so switching environments never reuses another backend.

## Local environment (floci)

Prerequisites: Docker Desktop with at least 6 CPUs, 12 GiB memory and 100 GB disk; Terraform >= 1.6 (CI uses 1.17); AWS CLI v2; kubectl >= 1.36. Argo CD on floci reads a snapshot of your working tree from a local Git mirror (Gitea on `127.0.0.1:3030`), so nothing has to be pushed.

```bash
make local-all        # floci, identity, state, ECR, images, VPC/EKS/MSK, Argo CD, edge proxy
make local-verify     # fitness functions F1-F5
make tf-test          # terraform test for every module, against floci
```

Then:

- App: http://localhost:8080 (canvas) and http://localhost:8080/cms
- kubectl: `export KUBECONFIG=infra/local/.kubeconfig`
- Argo CD: `kubectl -n argocd port-forward svc/argocd-server 8081:80` (user `admin`, password in secret `argocd-initial-admin-secret`)
- Load generator UI: `kubectl -n cms-demo port-forward svc/canvas-load 8090:8090`
- Real telemetry: copy `infra/local/.secrets.env.example` to `infra/local/.secrets.env`, then `make local-secrets` (`CX_OPS_EVENTS_API_KEY` there also turns on Coralogix annotations from Argo CD and local Terraform applies)
- After manifest changes: `make local-sync` (new snapshot; Argo CD refreshes, and syncs still retrying an older snapshot are restarted)
- After code changes: `make local-images`, then `make local-gitops` (new snapshot and image tag)
- Track a pushed GitHub branch instead: `make local-retarget BRANCH=<branch>` (`BRANCH=local` returns to the mirror)
- Stop / destroy: `make local-down` / `make local-nuke`
- Cluster API not answering: check `docker ps -a --filter label=io.floci.service=eks`; a stopped k3s container comes back with `docker start <name>` (floci gap G22; `make local-gitops` does this itself)

Generated, gitignored files: `infra/local/.aws/` (local-admin profile), `infra/local/.kubeconfig`, `infra/local/.last-image-tag`.

## AWS `dev`

Open decisions Q1, Q3, Q4 and Q5 (delivery plan) are placeholders in `envs/dev/*.tfvars` and `backend.hcl`; Terraform refuses to apply until they are filled in. The public hostname also appears in the `dev` overlays under `deploy/` as `cms-dev.replace-with-domain.invalid` (a valid name in the reserved `.invalid` TLD, so manifest validation passes); replace it with the Q3 hostname.

1. State bucket, once per account (local state, then migrate it into the bucket):
   ```bash
   terraform -chdir=infra/terraform/stacks/bootstrap init
   terraform -chdir=infra/terraform/stacks/bootstrap apply -var account_id=<account>
   ```
2. `make tf ENV=dev STACK=global CMD=apply` (ECR, GitHub OIDC roles, budget). Set repository variables `AWS_ACCOUNT_ID`, `PROMOTION_APP_ID` and secret `PROMOTION_APP_PRIVATE_KEY` for the workflows, plus secret `CX_OPS_EVENTS_API_KEY` (Send-Your-Data key with the OpsEvents preset; optional variable `CX_DOMAIN`, default `eu1.coralogix.com`) for Coralogix annotations.
3. `make tf ENV=dev STACK=infra CMD=apply` (or merge to `main`: `terraform.yml` applies after `dev` environment approval).
4. Write the secret values:
   ```bash
   aws secretsmanager put-secret-value --secret-id cms-demo/dev/coralogix-ingest --secret-string '{"PRIVATE_KEY":"..."}'
   aws secretsmanager put-secret-value --secret-id cms-demo/dev/coralogix-rum --secret-string '{"RUM_PUBLIC_KEY":"..."}'
   aws secretsmanager put-secret-value --secret-id cms-demo/dev/coralogix-ops-events --secret-string '{"API_KEY":"..."}'
   ```
   Operator Terraform runs record annotations too when `CX_OPS_EVENTS_API_KEY` is exported.
5. From an address in `admin_cidrs`: `make tf ENV=dev STACK=gitops CMD=apply`. Argo CD takes over from there.

Teardown: `make predestroy ENV=dev KUBE_CONTEXT=<context>`, then destroy `gitops`, then `infra`.
