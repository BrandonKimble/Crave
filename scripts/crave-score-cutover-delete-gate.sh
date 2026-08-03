#!/usr/bin/env bash
# @script-class: gate
# @run-by: NOT YET WIRED — see the 2026-08-03 blocker note below.
#
# WHAT THIS GATE IS FOR: the Crave Score cutover deleted an older public-scoring
# vocabulary (contextual scores, display-rank scores, PERCENT_RANK, raw quality
# colors) and banned synthesizing fake scores. Those deletions must hold.
#
# REDERIVED 2026-08-03 (audit D37 / F703). The gate had rotted in two ways:
#   (1) STALE PATHS — it grepped apps/api/src/modules/favorites/**,
#       overlays/panels/BookmarksPanel.tsx, services/favorite-lists.ts, and
#       screens/Profile/index.tsx, all removed by the lists rename (migration
#       20260726120000_lists_rename_and_favorites_kind). rg emitted 8
#       "No such file or directory" errors and the gate exited 1 on every run.
#       Repointed to apps/api/src/modules/user-lists and the live panels.
#   (2) SUPERSEDED INVARIANT — it locked "the continuous score / 100 curve"
#       (`clamp01(score / 100)`) and a "60-100" copy band. That model is GONE.
#       Crave Score display is now a FLAT 0-10 scale rendered through TEN
#       DISCRETE buckets from apps/mobile/src/constants/score-bucket-palette.json
#       (apps/mobile/src/utils/quality-color.ts is the single source of truth,
#       shared with the sprite generators). Asserting the old curve would pin the
#       code to a design it deliberately left, so those checks were removed
#       rather than rewritten — the bucket model has its own source-of-truth
#       module and sprite-generation coupling to keep it honest.
#   Also removed: the per-file `require_active getCraveScoreColorFromScore`
#   loop. Three of its four files no longer exist, and NONE of the live panels
#   (ListsPanel / SaveListPanel / ProfilePanel / ListDetailPanel) call that
#   helper directly any more — preview dots render through shared components.
#   It was a positive design-shape assertion of exactly the class that rots.
#
# WHAT SURVIVES: the negative extermination scans. Those are the durable class
# and they are the reason this file still exists.
#
# BLOCKER (2026-08-03) — WHY THIS IS STILL NOT IN CI:
#   the no-fake-score scan has ONE live hit, and it looks like a real defect:
#     apps/api/src/modules/search/search-query.executor.ts:527
#       craveScore: this.toOptionalNumber(row.restaurant_crave_score) ?? 0,
#   Its comment claims this gives unscored restaurants a "neutral pin". It does
#   not. On the 0-10 scale, 0 maps to bucket 0 — the ORANGE-RED bottom tier.
#   quality-color.ts reserves NEUTRAL_SCORE_COLOR for null/NaN only, so coercing
#   to 0 renders an unscored restaurant as the worst place in the city. That is
#   the exact "no fake estimates" violation this scan exists to catch, and it
#   went unseen because this gate was run by nothing.
#   OWNER/search-territory call required: either drop the coercion and let the
#   value stay null (neutral gray), or rule the coercion legitimate and narrow
#   the scan. WIRE THIS GATE INTO ci.yml IN THE SAME CHANGE THAT SETTLES IT.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "crave-score-cutover-delete-gate: $1" >&2
  exit 1
}

scan_active() {
  local pattern="$1"
  local description="$2"
  shift 2
  if rg -n "$pattern" "$@" >/tmp/crave-score-delete-gate.out; then
    cat /tmp/crave-score-delete-gate.out >&2
    fail "$description"
  fi
}

require_active() {
  local pattern="$1"
  local description="$2"
  shift 2
  if ! rg -n "$pattern" "$@" >/tmp/crave-score-delete-gate.out; then
    fail "$description"
  fi
}

ACTIVE_PATHS=(
  "apps/api/src"
  "apps/api/scripts"
  "apps/mobile/src"
  "packages/shared/src/types/search.ts"
  "apps/api/prisma/schema.prisma"
)

scan_active "contextualScore|contextualPercentile|restaurantContextualScore|topDishContextual|contextual_score|contextual_percentile|restaurant_contextual_score|top_dish_contextual" \
  "old contextual public score fields still exist in active code or search types" \
  "${ACTIVE_PATHS[@]}"

scan_active "core_display_rank_scores|DisplayRankScore|\\bRankScore(Module|Service|Refresh|Queue|Worker)?\\b|rank-score|rank_score" \
  "old display-rank score owner still exists in active code or schema" \
  "${ACTIVE_PATHS[@]}"

scan_active "PERCENT_RANK" \
  "score-producing paths must not use PERCENT_RANK after Crave Score cutover" \
  "apps/api/src/modules/search" \
  "apps/api/src/modules/content-processing/public-crave-score"

scan_active "LEAST\\(100" \
  "public Crave Score raw quality must remain unconstrained before display projection" \
  "apps/api/src/modules/content-processing/public-crave-score"

scan_active "getQualityColor|qualityScore|restaurantQualityScore|foodQualityScore" \
  "mobile/search/lists public display paths still reference old raw quality score or color names" \
  "apps/mobile/src" \
  "apps/api/src/modules/search" \
  "apps/api/src/modules/user-lists" \
  "packages/shared/src/types/search.ts"

scan_active "rebuildAllScores\\(\\{" \
  "public Crave Score rebuilds must stay globally calibrated and must not pass scoped market/subject filters" \
  "apps/api/src"

scan_active "craveScore:\\s*[^,\n]+\\?\\?\\s*(0|60)" \
  "public score payloads must not synthesize fake 0/60 Crave Scores" \
  "apps/api/src/modules/search" \
  "apps/api/src/modules/user-lists" \
  "apps/mobile/src"

scan_active "craveScore:\\s*number \\| null" \
  "real public result and coverage contracts must require numeric craveScore; use preview-specific types for profile shells" \
  "packages/shared/src/types/search.ts" \
  "apps/mobile/src/screens/Search/components/search-map.tsx"

scan_active "craveScore[^\\n]*(\\?\\?|:)\\s*(0|60)|Number\\([^\\n]*craveScore[^\\n]*\\)" \
  "active readers must reject missing Crave Scores instead of coercing them to fake numbers" \
  "apps/api/src/modules/search" \
  "apps/api/src/modules/user-lists" \
  "apps/mobile/src"

# The bucket palette is the single source of truth for score color; see the
# header. Its integrity is enforced by score-bucket-palette.json + the sprite
# generators reading the same file, not by string-matching a curve here.

if ! rg -n "core_public_entity_scores|PublicEntityScore" \
  "apps/api/prisma/schema.prisma" \
  >/dev/null; then
  fail "Prisma schema must define the stable public Crave Score table"
fi

if ! rg -n "craveScore" \
  "packages/shared/src/types/search.ts" \
  >/dev/null; then
  fail "shared search payloads must expose craveScore"
fi

if ! rg -n "validate-crave-score-fixtures" \
  "apps/api/package.json" \
  >/dev/null; then
  fail "API package must expose the Crave Score fixture harness"
fi

echo "crave-score-cutover-delete-gate: pass"
