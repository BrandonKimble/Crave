#!/usr/bin/env bash
# @script-class: gate
# @run-by: .github/workflows/ci.yml (job no-bypass-search-runtime, step
#     'Static guard: crave-score cutover delete gate'). WIRED 2026-08-03; the
#     blocker recorded below was settled in the same change (see its closing
#     note) — the header used to still say NOT YET WIRED, corrected 2026-08-04.
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
# BLOCKER (2026-08-03) — SETTLED. Kept as the record of what wiring cost.
#   RESOLUTION (verified 2026-08-04): the coercion was dropped —
#   search-query.executor.ts:531 now reads
#   `craveScore: this.toOptionalNumber(row.restaurant_crave_score)` with no
#   `?? 0`, so an unscored restaurant stays null and renders neutral gray. The
#   scan has zero live hits and the gate is green in CI. Original text:
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

# TOOL PRECONDITION + SOUND SCANNING VOCABULARY (F8900, 2026-08-07).
#
# This gate used to carry its own `fail` / `scan_active` / `require_active` —
# ~60 lines that were a verbatim copy of the same helpers in
# search-results-prepared-rows-delete-gate.sh, themselves written to close
# F8500: `if rg …; then` treats EVERY non-zero rg exit as "no match → clean",
# but exit 2 is an invalid regex and 127 is rg not installed, so a rotted
# pattern or a machine without ripgrep made every negative ban PASS having
# scanned nothing. Six gates each grew their own copy of the fix, which is a
# convention, not a mechanism. The vocabulary now lives once, in
# scripts/lib/gate-runner.sh, where a broken tool has no shape in which it can
# produce a pass — and where scripts/lib/gate-runner.test.sh proves it RED.
source "$ROOT_DIR/scripts/lib/gate-runner.sh"
gate_init crave-score-cutover-delete-gate fast
gate_require_tool rg

ACTIVE_PATHS=(
  "apps/api/src"
  "apps/api/scripts"
  "apps/mobile/src"
  "packages/shared/src/types/search.ts"
  "apps/api/prisma/schema.prisma"
)

gate_ban_absent old_contextual_public_score_fields \
  "old contextual public score fields still exist in active code or search types" \
  "contextualScore|contextualPercentile|restaurantContextualScore|topDishContextual|contextual_score|contextual_percentile|restaurant_contextual_score|top_dish_contextual" \
  "${ACTIVE_PATHS[@]}"

gate_ban_absent old_display_rank_score_owner \
  "old display-rank score owner still exists in active code or schema" \
  "core_display_rank_scores|DisplayRankScore|\\bRankScore(Module|Service|Refresh|Queue|Worker)?\\b|rank-score|rank_score" \
  "${ACTIVE_PATHS[@]}"

gate_ban_absent score_producing_paths_must_not \
  "score-producing paths must not use PERCENT_RANK after Crave Score cutover" \
  "PERCENT_RANK" \
  "apps/api/src/modules/search" \
  "apps/api/src/modules/content-processing/public-crave-score"

gate_ban_absent public_crave_score_raw_quality \
  "public Crave Score raw quality must remain unconstrained before display projection" \
  "LEAST\\(100" \
  "apps/api/src/modules/content-processing/public-crave-score"

gate_ban_absent mobile_search_lists_public_display \
  "mobile/search/lists public display paths still reference old raw quality score or color names" \
  "getQualityColor|qualityScore|restaurantQualityScore|foodQualityScore" \
  "apps/mobile/src" \
  "apps/api/src/modules/search" \
  "apps/api/src/modules/user-lists" \
  "packages/shared/src/types/search.ts"

gate_ban_absent public_crave_score_rebuilds_must \
  "public Crave Score rebuilds must stay globally calibrated and must not pass scoped market/subject filters" \
  "rebuildAllScores\\(\\{" \
  "apps/api/src"

gate_ban_absent public_score_payloads_must_not \
  "public score payloads must not synthesize fake 0/60 Crave Scores" \
  "craveScore:\\s*[^,\n]+\\?\\?\\s*(0|60)" \
  "apps/api/src/modules/search" \
  "apps/api/src/modules/user-lists" \
  "apps/mobile/src"

# SUPERSEDED 2026-08-03 (F758): `craveScore: number | null` is now the LAW for
# restaurant results and map features — null means UNSCORED and renders the
# neutral color; the old non-null contract is what forced the `?? 0` coercion
# that painted unscored restaurants as the worst tier. The dish/connection
# ranked contracts stay non-null (they throw on unscored input); what stays
# banned is OPTIONALITY — an absent key hides the question null answers.
gate_ban_absent cravescore_must_be_present_number \
  "craveScore must be present (number, or number|null for restaurants) — optionality hides the unscored case instead of answering it (F758)" \
  "craveScore\\?:" \
  "packages/shared/src/types/search.ts" \
  "apps/mobile/src/screens/Search/components/search-map.tsx"

# ([^.0-9]|$) bounds the literal so fixture decimals (0.99) don't match as "0".
gate_ban_absent active_readers_must_reject_missing \
  "active readers must reject missing Crave Scores instead of coercing them to fake numbers" \
  "craveScore[^\\n]*(\\?\\?|:)\\s*(0|60)([^.0-9]|$)|Number\\([^\\n]*craveScore[^\\n]*\\)" \
  "apps/api/src/modules/search" \
  "apps/api/src/modules/user-lists" \
  "apps/mobile/src"

# The bucket palette is the single source of truth for score color; see the
# header. Its integrity is enforced by score-bucket-palette.json + the sprite
# generators reading the same file, not by string-matching a curve here.

# F8900: these three were `if ! rg …; then fail`. The `!` inverts rg's 0/1 but
# SWALLOWS exit 2 (rotted pattern / unreadable path) and 127 into "present → no
# fail" — the F8800 polarity of the same swallow. gate_require_present
# discriminates every status, so a broken check goes RED instead of green.
gate_require_present schema_public_entity_scores \
  "Prisma schema must define the stable public Crave Score table" \
  "core_public_entity_scores|PublicEntityScore" \
  "apps/api/prisma/schema.prisma"

gate_require_present shared_payload_exposes_crave_score \
  "shared search payloads must expose craveScore" \
  "craveScore" \
  "packages/shared/src/types/search.ts"

gate_require_present api_exposes_crave_score_fixture_harness \
  "API package must expose the Crave Score fixture harness" \
  "validate-crave-score-fixtures" \
  "apps/api/package.json"

gate_summary "pass"
