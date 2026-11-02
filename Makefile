# Entry points for infrastructure and the floci local environment (infra/README.md).
SHELL := /bin/bash
.DEFAULT_GOAL := help

include infra/mk/local.mk
include infra/mk/terraform.mk

.PHONY: help
help: ## List targets
	@grep -hE '^[a-zA-Z0-9_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  %-20s %s\n", $$1, $$2}'
