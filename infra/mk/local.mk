# floci local environment (spec/components/floci-local-environment.md).
LOCAL_SCRIPTS := infra/local/scripts
COMPOSE := docker compose -f infra/local/docker-compose.yml

# PROFILE=ci caps the k3s container for standard GitHub arm64 runners (4 vCPU / 16 GB).
PROFILE ?= laptop
ifeq ($(PROFILE),ci)
export FLOCI_EKS_MAX_VCPUS ?= 4
export FLOCI_EKS_MAX_MEMORY_MIB ?= 12288
endif

.PHONY: local-up local-identity local-state local-apply-global local-images local-apply \
        local-secrets local-gitops local-kubeconfig local-edge local-all local-verify \
        local-sync local-retarget local-down local-nuke predestroy

local-up: ## Start floci and wait until it answers
	$(COMPOSE) up -d floci
	$(LOCAL_SCRIPTS)/wait-floci.sh

local-identity: ## Create the local-admin IAM user and the cms-local AWS profile
	$(LOCAL_SCRIPTS)/identity.sh

local-state: ## Create the Terraform state bucket and lock table on floci
	$(LOCAL_SCRIPTS)/state.sh

local-apply-global: ## Apply the global stack (ECR repositories) on floci
	$(LOCAL_SCRIPTS)/tf.sh local global apply -auto-approve -input=false

local-images: ## Build the six images and push them to floci ECR
	$(LOCAL_SCRIPTS)/images.sh

local-apply: ## Apply the infra stack (VPC, EKS, MSK, config) on floci
	$(LOCAL_SCRIPTS)/tf.sh local infra apply -auto-approve -input=false

local-secrets: ## Write real secret values from infra/local/.secrets.env (optional)
	$(LOCAL_SCRIPTS)/secrets.sh

local-gitops: ## Bootstrap Argo CD on the local cluster and set the image tag override
	$(LOCAL_SCRIPTS)/gitops.sh

local-kubeconfig: ## Write infra/local/.kubeconfig for the local cluster
	$(LOCAL_SCRIPTS)/kubeconfig.sh

local-edge: ## Publish the Gateway on http://localhost:8080
	$(LOCAL_SCRIPTS)/edge.sh

local-all: local-up local-identity local-state local-apply-global local-images local-apply local-secrets local-gitops local-edge ## Full local bring-up (steps 1-10)

local-verify: ## Run fitness functions F1-F5
	$(LOCAL_SCRIPTS)/verify.sh

local-sync: ## Push a snapshot of the working tree to the local Git mirror; Argo CD refreshes
	$(LOCAL_SCRIPTS)/git-sync.sh

local-retarget: ## Track a pushed GitHub branch (or BRANCH=local for the mirror): make local-retarget BRANCH=<name>
	$(LOCAL_SCRIPTS)/retarget.sh "$(BRANCH)"

local-down: ## Stop floci and the edge proxy (state and volumes kept)
	$(COMPOSE) --profile app down

local-nuke: ## Destroy the local environment completely (F6)
	$(LOCAL_SCRIPTS)/nuke.sh

predestroy: ## Remove controller-created resources before destroy: make predestroy ENV=<env> [KUBE_CONTEXT=...]
	$(LOCAL_SCRIPTS)/predestroy.sh "$(ENV)"
