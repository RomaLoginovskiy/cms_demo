# Terraform and manifest checks. Stacks are shared by every environment (infra/terraform/README.md).
ENV ?= local
STACK ?= infra
CMD ?= plan
TF_STACKS := bootstrap global infra gitops observability
OVERLAYS := deploy/apps/cms-demo/overlays/local deploy/apps/cms-demo/overlays/dev deploy/apps/cms-demo/overlays/prod \
            deploy/platform/external-secrets/stores deploy/platform/envoy-gateway/base \
            deploy/platform/envoy-gateway/proxy/aws deploy/platform/envoy-gateway/proxy/floci \
            deploy/platform/argo-cd/notifications

.PHONY: tf tf-fmt tf-validate deploy-render

tf: ## Run Terraform for a stack: make tf ENV=dev STACK=infra CMD=plan
	infra/local/scripts/tf.sh $(ENV) $(STACK) $(CMD)

tf-fmt: ## Check Terraform formatting
	terraform fmt -check -recursive infra/terraform

tf-validate: ## Validate every stack without a backend, and run stack tests (mocked providers, offline)
	@set -e; for s in $(TF_STACKS); do \
	  echo "validate $$s"; \
	  TF_DATA_DIR=$(CURDIR)/infra/terraform/stacks/$$s/.terraform-validate terraform -chdir=infra/terraform/stacks/$$s init -backend=false -input=false >/dev/null; \
	  TF_DATA_DIR=$(CURDIR)/infra/terraform/stacks/$$s/.terraform-validate terraform -chdir=infra/terraform/stacks/$$s validate; \
	  if [ -d infra/terraform/stacks/$$s/tests ]; then \
	    TF_DATA_DIR=$(CURDIR)/infra/terraform/stacks/$$s/.terraform-validate terraform -chdir=infra/terraform/stacks/$$s test; \
	  fi; \
	done

deploy-render: ## Render the Kustomize overlays (helmCharts overlays are rendered in CI)
	@set -e; for d in $(OVERLAYS); do echo "render $$d"; kubectl kustomize $$d >/dev/null; done
