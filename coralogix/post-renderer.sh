#!/usr/bin/env bash
# Post-renderer for Helm: rewrites mountPropagation: HostToContainer -> None.
# Docker Desktop's VM root filesystem is not a shared mount, so HostToContainer
# propagation fails. None still creates the hostPath bind-mounts (host fs is
# readable) without requiring shared-propagation support.
set -euo pipefail
sed 's/mountPropagation: HostToContainer/mountPropagation: None/g'
