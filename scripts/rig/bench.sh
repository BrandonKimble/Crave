#!/usr/bin/env bash
# @script-class: operational
# @run-by: the reextract/iteration-bench workflow (plans/iteration-bench.md).
# THE ITERATION BENCH runner (plans/iteration-bench.md). Thin wrapper over
# apps/api/scripts/bench.ts — same REEXTRACT_DB targeting law as
# reextract.sh (local db unless REEXTRACT_DB is set; staging is the
# sanctioned laptop target, prod refuses in prisma.service).
#
#   bench.sh start <version> [communities]   bench.sh status
#   bench.sh advance                         bench.sh preflight
#   bench.sh approve <hash>                  bench.sh campaign <id>
#   bench.sh drive-loop                      bench.sh diff-artifact <path>
#   bench.sh close-review <summary>          bench.sh outcome <verdict>
#
# drive-loop = law 3 made operational: loops one drive step until DRAINED,
# exits loudly on STALLED (exit 2) so silence can never mean anything.
set -euo pipefail
API="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../apps/api" && pwd)"
db_url() { echo "${REEXTRACT_DB:-postgresql://postgres:postgres@localhost:5432/crave_search}"; }
run_node() { (cd "$API" && DATABASE_URL="$(db_url)" TS_NODE_TRANSPILE_ONLY=1 npx ts-node scripts/bench.ts "$@"); }

VERB="${1:-status}"; shift || true
case "$VERB" in
  drive-loop)
    while true; do
      OUT="$(run_node drive)" || { echo "$OUT"; echo "STALLED — investigate the poller"; exit 2; }
      echo "$OUT"
      case "$OUT" in
        DRAINED*) exit 0 ;;
      esac
      sleep 120
    done
    ;;
  diff)
    # S3: the review file + the two REQUIRED triage briefs, in one verb.
    COMMUNITIES="${1:?bench.sh diff <communities> <version>}"
    VERSION="${2:?bench.sh diff <communities> <version>}"
    API_SCRIPTS="$API/scripts"
    HASH=$(psql "$(db_url)" -tAc "SELECT content_hash FROM llm_prompts WHERE kind='collection_system' AND version=$VERSION;")
    STAMP=$(date +%Y%m%d-%H%M%S)
    OUT="$API/logs/bench-review-$STAMP.txt"
    mkdir -p "$API/logs"
    psql "$(db_url)" -v communities="$COMMUNITIES" -v prompt_hash="$HASH" -f "$API_SCRIPTS/reload/shadow-diff.sql" > "$OUT" 2>&1
    SINCE=$(psql "$(db_url)" -tAc "SELECT COALESCE(min(started_at), now() - interval '14 days')::timestamptz FROM collection_extraction_runs WHERE system_prompt_hash='$HASH';")
    psql "$(db_url)" -v since="$SINCE" -f "$API_SCRIPTS/reload/anchor-audit.sql" >> "$OUT" 2>&1
    for KIND in lost-support new-entities; do
      BRIEF="$API/logs/bench-review-$STAMP.$KIND.brief.md"
      if [ "$KIND" = "lost-support" ]; then
        cat > "$BRIEF" <<EOF2
Triage the LOST SUPPORT section of $OUT against source text (shadow DB per
REEXTRACT_DB; prompt hash $HASH; communities $COMMUNITIES). Classify a
stratified sample: CORRECT-KILL (quote the killed junk class) / REGRESSION
(quote what the candidate should have caught) / RESOLVE-SHIFT (name the
entity it moved to). List every TRUE user-anchored loss individually.
Record the summary: bench.sh triage lost-support "<summary>"
EOF2
      else
        cat > "$BRIEF" <<EOF2
Audit EVERY row of the NEW UNDER SHADOW section of $OUT against source
text (shadow DB per REEXTRACT_DB; hash $HASH). Classify REAL-GAIN /
JUNK-MINT (quote + violated rule) / VARIANT-TWIN. Check the standing
invariants: zero bare generic-word restaurants, zero live evaluative-word
entities, cuisines only in the attribute slot.
Record the summary: bench.sh triage new-entities "<summary>"
EOF2
      fi
      echo "BRIEF: $BRIEF"
    done
    run_node diff-artifact "$OUT"
    echo "REVIEW: $OUT"
    ;;
  *)
    run_node "$VERB" "$@"
    ;;
esac
