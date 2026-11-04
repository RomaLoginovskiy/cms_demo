#!/usr/bin/env bash
# Sends one event to the Coralogix ops-events API; Coralogix draws it as an annotation on APM, Explore
# and dashboard charts and stores it in the default/ops.events dataset (ADR-025,
# spec/components/coralogix-annotations.md). Bash 3.2 compatible; needs curl and jq.
#
#   ops-event.sh cd --task-type build|test|deploy --task-name NAME --status STATUS --description TEXT
#                   [--service NAME] [--environment ENV] [--extra key=value]...
#   ops-event.sh custom --description TEXT [--service NAME] [--environment ENV] [--extra key=value]...
#   ops-event.sh terraform --env ENV --stack STACK --action apply|destroy --exit-code N --log FILE
#
# STATUS: success, failure, cancelled, timeout, error or skipped (GitHub's job.status values work).
# cd events need GitHub Actions (the API requires a CD system); custom and terraform events also run
# on an operator's machine and take the commit from the local checkout.
#
# Environment:
#   CX_OPS_EVENTS_API_KEY   Send-Your-Data key with the OpsEvents preset; unset = log and skip
#   CX_DOMAIN               Coralogix domain (default eu1.coralogix.com), or CX_OPS_EVENTS_URL
#   CX_OPS_EVENTS_DRY_RUN=1 print the event instead of sending it
#   CX_OPS_EVENTS_NOOP=1    also send Terraform runs that changed nothing
#
# A missing key or a rejected request is a warning: annotations never fail a pipeline or an apply.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() { printf '[ops-event] %s\n' "$*" >&2; }
warn() {
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    printf '::warning title=Coralogix annotation::%s\n' "$*"
  else
    printf '\033[1;33m[ops-event]\033[0m %s\n' "$*" >&2
  fi
}
die() { printf '[ops-event] %s\n' "$*" >&2; exit 2; }

command -v jq >/dev/null || die "jq is required"
command -v curl >/dev/null || die "curl is required"

tmp_files=()
cleanup() { [ ${#tmp_files[@]} -eq 0 ] || rm -f "${tmp_files[@]}"; }
trap cleanup EXIT
# new_tmp VAR: a private temp file (mktemp is 0600), removed on exit.
new_tmp() { local f; f="$(mktemp "${TMPDIR:-/tmp}/ops-event.XXXXXX")"; tmp_files+=("$f"); printf -v "$1" '%s' "$f"; }

# git@host:owner/repo.git, ssh:// and credentialed https:// remotes all become https://host/owner/repo.
https_url() {
  printf '%s' "$1" | sed -E \
    -e 's#^git@([^:]+):#https://\1/#' \
    -e 's#^ssh://git@([^/]+)/#https://\1/#' \
    -e 's#^(https?://)[^@/]+@#\1#' \
    -e 's#\.git$##'
}

# Commit and pipeline context, shared by every event kind so ops.events can be queried uniformly.
# GitHub Actions variables first; otherwise the local checkout (dirty = uncommitted changes under
# $dirty_paths, so an operator apply from an edited tree is not mistaken for the commit).
dirty_paths=""
collect_context() {
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    origin="github-actions"
    repo_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}"
    repo_name="$GITHUB_REPOSITORY"
    ref_name="${GITHUB_REF_NAME:-}"
    ref_type="${GITHUB_REF_TYPE:-branch}"
    revision="$GITHUB_SHA"
    dirty=""
    actor="${GITHUB_ACTOR:-}"
    pipeline_name="${GITHUB_WORKFLOW:-}"
    run_id="${GITHUB_RUN_ID:-}"
    run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID:-}"
  else
    origin="operator"
    repo_url="$(https_url "$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)")"
    repo_name="$(printf '%s' "$repo_url" | sed -E 's#^https?://[^/]+/##')"
    ref_name="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    ref_type="branch"
    revision="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
    dirty="false"
    # shellcheck disable=SC2086 # dirty_paths is a space-separated pathspec list
    if [ -n "$(git -C "$ROOT" status --porcelain -- $dirty_paths 2>/dev/null)" ]; then dirty="true"; fi
    actor="$(git -C "$ROOT" config user.name 2>/dev/null || true)"
    actor="${actor:-${USER:-}}"
    pipeline_name=""
    run_id=""
    run_url=""
  fi
  commit_subject="$(git -C "$ROOT" log -1 --format=%s 2>/dev/null | cut -c1-200 || true)"
  commit_author="$(git -C "$ROOT" log -1 --format=%an 2>/dev/null || true)"
  commit_url=""
  case "$repo_url" in https://github.com/*) [ -z "$revision" ] || commit_url="$repo_url/commit/$revision" ;; esac
}

result_status() {
  case "$1" in
    success) echo PIPELINE_RESULT_STATUS_SUCCESS ;;
    failure) echo PIPELINE_RESULT_STATUS_FAILURE ;;
    cancelled|cancellation) echo PIPELINE_RESULT_STATUS_CANCELLATION ;;
    timeout) echo PIPELINE_RESULT_STATUS_TIMEOUT ;;
    error) echo PIPELINE_RESULT_STATUS_ERROR ;;
    skipped|skip) echo PIPELINE_RESULT_STATUS_SKIP ;;
    *) die "unknown status '$1'" ;;
  esac
}

task_type() {
  case "$1" in
    build) echo PIPELINE_TASK_TYPE_BUILD ;;
    test) echo PIPELINE_TASK_TYPE_TEST ;;
    deploy) echo PIPELINE_TASK_TYPE_DEPLOY ;;
    *) die "unknown task type '$1' (build, test or deploy)" ;;
  esac
}

# The shared context plus --extra key=value pairs; an --extra key overrides a context key (for
# example commitAuthor of a commit made outside this checkout). Empty values are dropped.
extra_args=()
add_extra() {
  case "$1" in *=*) ;; *) die "--extra expects key=value, got '$1'" ;; esac
  extra_args+=(--arg "${1%%=*}" "${1#*=}")
}
additional_json() {
  # Merged explicitly: jq versions disagree on which duplicate --arg wins in $ARGS.named.
  jq -n \
    --argjson context "$(jq -n \
      --arg origin "$origin" --arg actor "$actor" \
      --arg vcsRepository "$repo_url" --arg vcsRef "$ref_name" --arg vcsRevision "$revision" \
      --arg vcsDirty "$dirty" --arg commitUrl "$commit_url" --arg commitSubject "$commit_subject" \
      --arg commitAuthor "$commit_author" --arg pipelineRunUrl "$run_url" '$ARGS.named')" \
    --argjson extra "$(jq -n ${extra_args[@]+"${extra_args[@]}"} '$ARGS.named')" \
    '$context + $extra | with_entries(select(.value != ""))'
}

# $1 = cdEvent or customEvent, $2 = its JSON body.
event_json() {
  jq -n \
    --arg ts "${timestamp:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" --arg description "$description" \
    --arg service "$service" --arg environment "$environment" \
    --argjson additional "$(additional_json)" --arg kind "$1" --argjson body "$2" \
    '{opsEvent: ({
        timestamp: $ts,
        description: $description,
        attributes: ({}
          + (if $service != "" then {service: {name: $service}} else {} end)
          + (if $environment != "" then {environment: $environment} else {} end)
          + (if ($additional | length) > 0 then {additional: $additional} else {} end))
      } + {($kind): $body})}'
}

cd_body() {
  local ref_kind=VCS_REF_TYPE_BRANCH
  [ "$ref_type" = "tag" ] && ref_kind=VCS_REF_TYPE_TAG
  jq -n \
    --arg pipeline "$pipeline_name" --arg runId "$run_id" --arg runUrl "$run_url" \
    --arg status "$status_enum" --arg taskName "$task_name" --arg taskType "$task_enum" \
    --arg refType "$ref_kind" --arg repoName "$repo_name" --arg repoUrl "$repo_url" \
    --arg refName "$ref_name" --arg revision "$revision" \
    '{
      system: "CD_SYSTEM_GITHUB",
      pipeline: {
        name: $pipeline,
        run: {id: $runId, url: $runUrl},
        result: {status: $status},
        task: {name: $taskName, type: $taskType}
      },
      vcs: {
        system: "VCS_SYSTEM_GITHUB",
        type: $refType,
        repository: {name: $repoName, url: $repoUrl},
        ref: {head: {name: $refName, revision: $revision}}
      }
    }'
}

send() {
  local payload="$1" url header response code
  if [ "${CX_OPS_EVENTS_DRY_RUN:-}" = "1" ]; then
    printf '%s\n' "$payload"
    return 0
  fi
  if [ -z "${CX_OPS_EVENTS_API_KEY:-}" ]; then
    log "CX_OPS_EVENTS_API_KEY is not set; not sent: $description"
    return 0
  fi
  url="${CX_OPS_EVENTS_URL:-https://api.${CX_DOMAIN:-eu1.coralogix.com}/v1/ops-events}"
  # The key goes through a private header file, not the command line (visible in ps).
  new_tmp header
  new_tmp response
  printf 'Authorization: Bearer %s\n' "$CX_OPS_EVENTS_API_KEY" > "$header"
  if ! code="$(printf '%s' "$payload" | curl -sS -o "$response" -w '%{http_code}' --max-time 15 --retry 2 \
      -X POST "$url" -H "@$header" -H 'Content-Type: application/json' --data-binary @- 2>&1)"; then
    warn "could not reach $url: $code"
    return 0
  fi
  case "$code" in
    2??) log "annotation sent ($code): $description" ;;
    403) warn "Coralogix refused the annotation (403): invalid key, or a key without the OpsEvents role preset" ;;
    *) warn "Coralogix rejected the annotation ($code): $(head -c 300 "$response")" ;;
  esac
  return 0
}

# Terraform apply/destroy output -> one infrastructure-change event. No-op runs are skipped.
terraform_event() {
  local env="" stack="" action="" exit_code="" log_file=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --env) env="$2"; shift 2 ;;
      --stack) stack="$2"; shift 2 ;;
      --action) action="$2"; shift 2 ;;
      --exit-code) exit_code="$2"; shift 2 ;;
      --log) log_file="$2"; shift 2 ;;
      *) die "terraform: unknown argument $1" ;;
    esac
  done
  if [ -z "$env" ] || [ -z "$stack" ] || [ -z "$action" ] || [ -z "$exit_code" ]; then
    die "terraform: --env, --stack, --action and --exit-code are required"
  fi
  [ -f "$log_file" ] || die "terraform: log file '$log_file' not found"

  local esc clean summary added changed destroyed imported resources total shown error result
  esc="$(printf '\033')"
  # Byte-wise (LC_ALL=C): Terraform's box-drawing error frames must not trip BSD sed's UTF-8 checks.
  export LC_ALL=C
  clean="$(sed "s/${esc}\[[0-9;]*m//g" "$log_file")"
  if printf '%s\n' "$clean" | grep -q '^Apply cancelled\.'; then
    log "terraform $action $env/$stack was cancelled; nothing to record"
    return 0
  fi

  summary="$(printf '%s\n' "$clean" | grep -E '(Apply|Destroy) complete! Resources:' | tail -n1 || true)"
  count() { printf '%s' "$summary" | grep -oE "[0-9]+ $1" | grep -oE '^[0-9]+' || echo 0; }
  added="$(count added)"; changed="$(count changed)"; destroyed="$(count destroyed)"; imported="$(count imported)"

  if [ "$exit_code" = "0" ] && [ $((added + changed + destroyed + imported)) -eq 0 ] && [ "${CX_OPS_EVENTS_NOOP:-}" != "1" ]; then
    log "terraform $action $env/$stack changed nothing; no event"
    return 0
  fi

  # "+addr" created, "~addr" updated in place, "-addr" destroyed (a replacement shows as - and +).
  resources="$(printf '%s\n' "$clean" \
    | sed -nE 's/^(.+): (Creation|Modifications|Destruction) complete after.*/\2 \1/p' \
    | sed -e 's/^Creation /+/' -e 's/^Modifications /~/' -e 's/^Destruction /-/' \
    | awk '!seen[$0]++')"
  total="$(printf '%s' "$resources" | grep -c . || true)"
  shown="$(printf '%s\n' "$resources" | head -n 25 | paste -sd ',' - | sed 's/,/, /g')"
  [ "$total" -le 25 ] || shown="$shown (+$((total - 25)) more)"

  if [ "$exit_code" = "0" ]; then
    result="success"
    description="Terraform $action $env/$stack: $added added, $changed changed, $destroyed destroyed"
  else
    result="failure"
    error="$(printf '%s\n' "$clean" | grep -m1 'Error: ' | sed 's/^.*Error: //' | cut -c1-300 || true)"
    description="Terraform $action $env/$stack failed: ${error:-exit code $exit_code}"
    description="$(printf '%s' "$description" | cut -c1-200)"
    add_extra "error=${error:-}"
  fi

  service=""
  environment="$env"
  add_extra "category=infrastructure"
  add_extra "tool=terraform"
  add_extra "stack=$stack"
  add_extra "action=$action"
  add_extra "result=$result"
  add_extra "added=$added"
  add_extra "changed=$changed"
  add_extra "destroyed=$destroyed"
  [ "$imported" = "0" ] || add_extra "imported=$imported"
  add_extra "resources=$shown"

  # The gitops stack also reads deploy/platform/argo-cd values.
  dirty_paths="infra/terraform deploy/platform/argo-cd"
  collect_context
  local payload
  payload="$(event_json customEvent '{}')"
  send "$payload"
}

[ $# -ge 1 ] || die "usage: ops-event.sh cd|custom|terraform [options] (see the header of this script)"
kind="$1"; shift

if [ "$kind" = "terraform" ]; then
  terraform_event "$@"
  exit 0
fi

description="" service="" environment="" status="" task_kind="" task_name="" timestamp=""
while [ $# -gt 0 ]; do
  case "$1" in
    --description) description="$2"; shift 2 ;;
    --service) service="$2"; shift 2 ;;
    --environment) environment="$2"; shift 2 ;;
    --status) status="$2"; shift 2 ;;
    --task-type) task_kind="$2"; shift 2 ;;
    --task-name) task_name="$2"; shift 2 ;;
    --timestamp) timestamp="$2"; shift 2 ;;
    --extra) add_extra "$2"; shift 2 ;;
    *) die "unknown argument $1" ;;
  esac
done
[ -n "$description" ] || die "--description is required"

collect_context
# Assignments, not inline substitutions, so a validation failure stops the script.
case "$kind" in
  cd)
    [ "$origin" = "github-actions" ] || die "cd events need GitHub Actions; use 'custom' elsewhere"
    if [ -z "$status" ] || [ -z "$task_kind" ] || [ -z "$task_name" ]; then
      die "cd: --status, --task-type and --task-name are required"
    fi
    status_enum="$(result_status "$status")"
    task_enum="$(task_type "$task_kind")"
    body="$(cd_body)"
    payload="$(event_json cdEvent "$body")"
    ;;
  custom)
    payload="$(event_json customEvent '{}')"
    ;;
  *)
    die "unknown event kind '$kind' (cd, custom or terraform)"
    ;;
esac
send "$payload"
