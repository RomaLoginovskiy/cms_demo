#!/usr/bin/env bash
# Runs `terraform test` for Terraform modules against floci: tf-test.sh [module ...] (default: all with tests).
# Tests create and destroy their own resources under tftest-* names; floci must be up (make local-up local-identity).
. "$(dirname "$0")/lib.sh"
use_identity

if [ $# -gt 0 ]; then
  modules=("$@")
else
  modules=()
  for d in "$TF_DIR"/modules/*/tests; do modules+=("$(basename "$(dirname "$d")")"); done
fi

failed=()
for m in "${modules[@]}"; do
  dir="$TF_DIR/modules/$m"
  [ -d "$dir/tests" ] || die "module $m has no tests/"
  log "terraform test: $m"
  export TF_DATA_DIR="$dir/.terraform-test"
  terraform -chdir="$dir" init -input=false -backend=false >/dev/null
  terraform -chdir="$dir" test -no-color || failed+=("$m")
done

[ "${#failed[@]}" -eq 0 ] || die "terraform test failed: ${failed[*]}"
log "terraform test passed: ${modules[*]}"
