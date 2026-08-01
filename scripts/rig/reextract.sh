#!/usr/bin/env bash
# RE-EXTRACTION COORDINATOR (agent-operated; see .claude/skills/reextract).
# Prompt iteration never pauses collection: live lanes extract under the
# ACTIVE prompt version while a CANDIDATE runs shadow replays. Sequence:
#
#   push      <prompt.md>                      register candidate version
#   estimate  <communities|all>                docs → campaign manifest (approve by hash)
#   shadow    <communities> <version> <campaign>   arm the shadow replay (worker env)
#   diff      <communities> <version>          shadow-diff + anchor-audit → review file
#   activate  <communities> <version>          flip pointers + rebuild + GC + audit
#   status                                     campaigns, shadow runs, lane health
#
# Spend law: shadow/activate refuse without an approved campaign (runner +
# batch submit enforce isDispatchable). Wipe-city-derived.sql is NOT part of
# this flow anymore — it is the disaster tool only.
set -euo pipefail
cd "$(dirname "$0")/../.."
API=apps/api
VERB="${1:-}"; shift || true

db_url() { # target db for SQL verbs: local api db unless REEXTRACT_DB set
  echo "${REEXTRACT_DB:-postgresql://postgres:postgres@localhost:5432/crave_search}"
}

case "$VERB" in
  push)
    (cd "$API" && npx ts-node scripts/prompt-push.ts "$@")
    ;;
  estimate)
    COMMUNITIES="${1:?communities (comma list) required}"
    echo "Doc counts per community:"
    psql "$(db_url)" -tAc "SELECT community, count(*) FROM collection_source_documents WHERE community = ANY(string_to_array('$COMMUNITIES', ',')) GROUP BY community;"
    echo "Create+approve the campaign with the manifest flow (same machinery as onboarding):"
    echo "  cd $API && npx ts-node scripts/resume-campaign.ts --help   # or prepareManifestEstimate via seed-archive pattern"
    ;;
  shadow)
    COMMUNITIES="${1:?communities}"; VERSION="${2:?prompt version}"; CAMPAIGN="${3:?campaign id}"
    ENVIRONMENT="${REEXTRACT_ENV:-staging}"
    echo "Arming SHADOW replay on $ENVIRONMENT worker: communities=$COMMUNITIES v$VERSION campaign=$CAMPAIGN"
    railway variables --service worker --environment "$ENVIRONMENT" \
      --set "REEXTRACT_COMMUNITIES=$COMMUNITIES" \
      --set "REEXTRACT_CAMPAIGN_ID=$CAMPAIGN" \
      --set "REEXTRACT_PROMPT_VERSION=$VERSION" \
      --set "REEXTRACT_ACTIVATE=false"
    echo "Worker redeploy fires the one-shot runner at boot. Watch: railway logs --service worker --environment $ENVIRONMENT"
    echo "AFTER the batch queue drains: ./scripts/rig/reextract.sh diff $COMMUNITIES $VERSION"
    echo "Then DISARM: railway variable delete REEXTRACT_COMMUNITIES --service worker --environment $ENVIRONMENT (etc.)"
    ;;
  diff)
    COMMUNITIES="${1:?communities}"; VERSION="${2:?prompt version}"
    HASH=$(psql "$(db_url)" -tAc "SELECT content_hash FROM llm_prompts WHERE kind='collection_system' AND version=$VERSION;")
    [[ -n "$HASH" ]] || { echo "No prompt v$VERSION registered" >&2; exit 1; }
    OUT="logs/reextract-review-$(date +%Y%m%d-%H%M%S).txt"
    mkdir -p logs
    {
      psql "$(db_url)" -v communities="$COMMUNITIES" -v prompt_hash="$HASH" -f "$API/scripts/reload/shadow-diff.sql"
      psql "$(db_url)" -v since="$(date -u -v-14d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '14 days ago' +%Y-%m-%dT%H:%M:%SZ)" -f "$API/scripts/reload/anchor-audit.sql"
    } | tee "$OUT"
    echo ""
    echo "REVIEW FILE: $OUT — triage per .claude/skills/reextract (AUTO / AGENT-REVIEW / OWNER-DECISION)."
    ;;
  activate)
    COMMUNITIES="${1:?communities}"; VERSION="${2:?prompt version}"
    echo "Step 1/4: flip document pointers + projection rebuild (dry-run first)"
    (cd "$API" && npx ts-node scripts/activate-shadow.ts --communities "$COMMUNITIES" --prompt-version "$VERSION" "${3:-}")
    echo "Step 2/4 (after --execute): psql \$DB -f $API/scripts/reload/gc-unsupported-entities.sql   (then -v execute=1)"
    echo "Step 3/4: activate the prompt for LIVE collection: (cd $API && npx ts-node scripts/prompt-activate.ts $VERSION) + redeploy workers"
    echo "Step 4/4: ./scripts/rig/cost-reconcile.sh"
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
