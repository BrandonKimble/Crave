#!/usr/bin/env bash
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
  "apps/api/src/modules/favorites" \
  "apps/api/src/modules/content-processing/public-crave-score"

scan_active "LEAST\\(100" \
  "public Crave Score raw quality must remain unconstrained before display projection" \
  "apps/api/src/modules/content-processing/public-crave-score"

scan_active "getQualityColor|qualityScore|restaurantQualityScore|foodQualityScore" \
  "mobile/search/favorites public display paths still reference old raw quality score or color names" \
  "apps/mobile/src" \
  "apps/api/src/modules/search" \
  "apps/api/src/modules/favorites" \
  "packages/shared/src/types/search.ts"

scan_active "rebuildAllScores\\(\\{" \
  "public Crave Score rebuilds must stay globally calibrated and must not pass scoped market/subject filters" \
  "apps/api/src"

scan_active "craveScore:\\s*[^,\n]+\\?\\?\\s*(0|60)" \
  "public score payloads must not synthesize fake 0/60 Crave Scores" \
  "apps/api/src/modules/search" \
  "apps/api/src/modules/favorites" \
  "apps/mobile/src"

scan_active "craveScore:\\s*number \\| null" \
  "real public result and coverage contracts must require numeric craveScore; use preview-specific types for profile shells" \
  "packages/shared/src/types/search.ts" \
  "apps/mobile/src/screens/Search/components/search-map.tsx"

scan_active "craveScore[^\\n]*(\\?\\?|:)\\s*(0|60)|Number\\([^\\n]*craveScore[^\\n]*\\)" \
  "active readers must reject missing Crave Scores instead of coercing them to fake numbers" \
  "apps/api/src/modules/search" \
  "apps/api/src/modules/favorites" \
  "apps/mobile/src"

scan_active "export const getCraveScoreColor\\b|index:\\s*number,\\s*total:\\s*number|tFromScore \\?\\?" \
  "Crave Score color must not keep an index/total fallback path" \
  "apps/mobile/src/utils/quality-color.ts" \
  "apps/mobile/src/screens/Search/utils/quality.ts"

scan_active "resolveRankColor|previewItem\\.score|item\\.score|score\\?:\\s*number \\| null|score:\\s*this\\.toPublicScoreValue" \
  "favorite preview surfaces must expose numeric craveScore and use the shared Crave Score color curve" \
  "apps/api/src/modules/favorites/favorite-lists.service.ts" \
  "apps/mobile/src/services/favorite-lists.ts" \
  "apps/mobile/src/overlays/panels/BookmarksPanel.tsx" \
  "apps/mobile/src/overlays/panels/SaveListPanel.tsx" \
  "apps/mobile/src/overlays/panels/ProfilePanel.tsx" \
  "apps/mobile/src/screens/Profile/index.tsx"

for favorite_preview_file in \
  "apps/mobile/src/overlays/panels/BookmarksPanel.tsx" \
  "apps/mobile/src/overlays/panels/SaveListPanel.tsx" \
  "apps/mobile/src/overlays/panels/ProfilePanel.tsx" \
  "apps/mobile/src/screens/Profile/index.tsx"; do
  require_active "getCraveScoreColorFromScore\\([^\\n)]*\\.craveScore" \
    "favorite preview dots must use the shared Crave Score color curve in ${favorite_preview_file}" \
    "$favorite_preview_file"
done

scan_active "mentions|score confidence" \
  "score info copy must use public polls/votes/Crave Score language only" \
  "apps/mobile/src/screens/Search/components/SearchRankAndScoreSheets.tsx"

scan_active "60[–-]100" \
  "score info copy must describe the normal public Crave Score band as 60-99.9, not a guaranteed 100" \
  "apps/mobile/src/screens/Search/components/SearchRankAndScoreSheets.tsx"

if ! rg -n "clamp01\\(score / 100\\)" \
  "apps/mobile/src/utils/quality-color.ts" \
  >/dev/null; then
  fail "Crave Score color mapping must use the locked score / 100 continuous curve"
fi

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
