#!/usr/bin/env bash
# ESCAPE HATCH (2026-08-25): the ITERATION BENCH (scripts/rig/bench.sh,
# plans/iteration-bench.md) is the primary path for prompt iteration —
# it gates, drives, and records what this runbook asks a human to
# remember. Use these verbs directly only when the bench cannot express
# the operation, and tell the bench run about anything you did by hand.
# @script-class: operational
# @run-by: .claude/skills/reextract/SKILL.md.
# RE-EXTRACTION COORDINATOR (agent-operated; see .claude/skills/reextract).
# Prompt iteration never pauses collection: live lanes extract under the
# ACTIVE prompt version while a CANDIDATE runs shadow replays. Sequence:
#
#   push      <prompt.md>                      register candidate version
#   estimate  <communities|all>                docs → campaign manifest (approve by hash)
#   shadow    <communities> <version> <campaign>   arm the shadow replay (worker env)
#   diff      <communities> <version>          shadow-diff + anchor-audit → review file
#   activate  <communities> <version>          flip pointers + rebuild + GC + audit
#   rollback  <communities> <version>          flip BACK to the pre-activation runs (real: events retained)
#   report    <campaignId>                     quote vs envelope vs metered vs ledger actual, per caller
#   recover-refusals <campaignId>              re-admit banked contract refusals (v17 witness repair; no LLM spend)
#   discard   <version>                        abandon a candidate (runs+events+claims deleted, prompt retired, GC)
#   status                                     campaigns, shadow runs, lane health
#
# Spend law: shadow/activate refuse without an approved campaign (runner +
# batch submit enforce isDispatchable). Wipe-city-derived.sql is NOT part of
# this flow anymore — it is the disaster tool only.
set -euo pipefail
cd "$(dirname "$0")/../.."
API=apps/api
VERB="${1:-}"; shift || true

db_url() { # target db for ALL verbs: local api db unless REEXTRACT_DB set
  echo "${REEXTRACT_DB:-postgresql://postgres:postgres@localhost:5432/crave_search}"
}

# D3 (final red team): push/estimate/activate boot AppModule via ts-node and
# would silently use apps/api/.env's LOCAL DATABASE_URL — registering the
# candidate and approving the campaign in the LAPTOP database while the prod
# worker looked for them. Every verb now targets the same resolved db_url.
run_node() { DATABASE_URL="$(db_url)" npx ts-node "$@"; }

# LOW 9 (security red team): $VERSION is interpolated into SQL strings —
# operator-controlled, not remote, but a typo like "v3" produced a confusing
# psql error instead of a clean refusal. Integers only, validated once.
require_int_version() {
  [[ "$1" =~ ^[0-9]+$ ]] || { echo "REFUSED: version must be an integer, got '$1'" >&2; exit 1; }
}

case "$VERB" in
  push)
    (cd "$API" && run_node scripts/prompt-push.ts "$@")
    ;;
  estimate)
    COMMUNITIES="${1:?communities (comma list) required}"; VERSION="${2:?prompt version}"
    shift 2
    (cd "$API" && run_node scripts/reextract-estimate.ts --communities "$COMMUNITIES" --prompt-version "$VERSION" "$@")
    ;;
  shadow)
    COMMUNITIES="${1:?communities}"; VERSION="${2:?prompt version}"; CAMPAIGN="${3:?campaign id}"
    ENVIRONMENT="${REEXTRACT_ENV:-staging}"
    echo "Arming SHADOW replay on $ENVIRONMENT worker: communities=$COMMUNITIES v$VERSION campaign=$CAMPAIGN"
    railway variables --service worker --environment "$ENVIRONMENT" \
      --set "REEXTRACT_COMMUNITIES=$COMMUNITIES" \
      --set "REEXTRACT_CAMPAIGN_ID=$CAMPAIGN" \
      --set "REEXTRACT_PROMPT_VERSION=$VERSION" \
      --set "REEXTRACT_ACTIVATE=false" \
      --set "DISABLE_RESTAURANT_ENRICHMENT=true"
    echo "Worker redeploy fires the one-shot runner at boot. Watch: railway logs --service worker --environment $ENVIRONMENT"
    echo "AFTER the batch queue drains: ./scripts/rig/reextract.sh diff $COMMUNITIES $VERSION"
    echo "Then DISARM: railway variable delete REEXTRACT_COMMUNITIES / REEXTRACT_CAMPAIGN_ID / REEXTRACT_PROMPT_VERSION / REEXTRACT_ACTIVATE / DISABLE_RESTAURANT_ENRICHMENT --service worker --environment $ENVIRONMENT"
    ;;
  rollback)
    COMMUNITIES="${1:?communities}"; VERSION="${2:?prompt version}"
    require_int_version "$VERSION"
    shift 2
    echo "ROLLBACK of v$VERSION: docs flip back to their pre-activation runs (retained events make this exact)."
    (cd "$API" && run_node scripts/activate-shadow.ts --communities "$COMMUNITIES" --prompt-version "$VERSION" --rollback "$@")
    ;;
  discard)
    VERSION="${1:?prompt version}"
    require_int_version "$VERSION"
    echo "DISCARDING candidate v$VERSION: runs+events+claims deleted, prompt retired, then GC."
    psql "$(db_url)" -v version="$VERSION" -f "$API/scripts/reload/shadow-discard.sql"
    psql "$(db_url)" -f "$API/scripts/reload/gc-unsupported-entities.sql"
    ;;
  diff)
    COMMUNITIES="${1:?communities}"; VERSION="${2:?prompt version}"
    require_int_version "$VERSION"
    HASH=$(psql "$(db_url)" -tAc "SELECT content_hash FROM llm_prompts WHERE kind='collection_system' AND version=$VERSION;")
    [[ -n "$HASH" ]] || { echo "No prompt v$VERSION registered" >&2; exit 1; }
    OUT="logs/reextract-review-$(date +%Y%m%d-%H%M%S).txt"
    mkdir -p logs
    {
      psql "$(db_url)" -v communities="$COMMUNITIES" -v prompt_hash="$HASH" -f "$API/scripts/reload/shadow-diff.sql"
      SINCE=$(psql "$(db_url)" -tAc "SELECT COALESCE(min(started_at), now() - interval '14 days')::timestamptz FROM collection_extraction_runs WHERE system_prompt_hash='$HASH';")
      psql "$(db_url)" -v since="$SINCE" -f "$API/scripts/reload/anchor-audit.sql"
    } | tee "$OUT"
    echo ""
    echo "REVIEW FILE: $OUT — triage per .claude/skills/reextract (AUTO / AGENT-REVIEW / OWNER-DECISION)."
    ;;
  activate)
    COMMUNITIES="${1:?communities}"; VERSION="${2:?prompt version}"
    shift 2
    # D11: forward ALL remaining flags — activate-shadow refuses --execute
    # without --reviewed, and a single "${3:-}" could never carry both,
    # pushing the operator off the sanctioned path into a raw invocation.
    echo "Step 1/4: flip document pointers + projection rebuild (dry-run first)"
    (cd "$API" && run_node scripts/activate-shadow.ts --communities "$COMMUNITIES" --prompt-version "$VERSION" "$@")
    echo "Step 2/4 (after --execute): psql \$DB -f $API/scripts/reload/gc-unsupported-entities.sql   (then -v execute=1)"
    echo "Step 3/4: activate the prompt for LIVE collection: (cd $API && npx ts-node scripts/prompt-activate.ts $VERSION) + redeploy workers"
    echo "Step 4/4: ./scripts/rig/cost-reconcile.sh"
    ;;
  report)
    CAMPAIGN="${1:?campaignId required}"
    (cd "$API" && run_node scripts/reextract-report.ts "$CAMPAIGN")
    ;;
  recover-refusals)
    CAMPAIGN="${1:?campaignId required}"
    echo "Recovering banked contract refusals for campaign $CAMPAIGN (witness repair; recovered rows leave the bank, residue stays)"
    (cd "$API" && run_node scripts/replay-banked-refusals.ts --campaign "$CAMPAIGN")
    ;;
  status)
    psql "$(db_url)" -c "SELECT version, status, left(content_hash,12) hash, created_at::date, activated_at::date FROM llm_prompts WHERE kind='collection_system' ORDER BY version;"
    psql "$(db_url)" -c "SELECT name, state, spent_micros/1e6 AS spent_usd, estimate_micros/1e6 AS estimate_usd FROM spend_campaigns ORDER BY created_at DESC LIMIT 8;"
    ;;
  *)
    grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
