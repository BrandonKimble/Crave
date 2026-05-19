#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "search-demand-cutover-delete-gate: $1" >&2
  exit 1
}

scan_active() {
  local pattern="$1"
  local description="$2"
  shift 2
  if rg -n "$pattern" "$@" >/tmp/search-demand-delete-gate.out; then
    cat /tmp/search-demand-delete-gate.out >&2
    fail "$description"
  fi
}

ACTIVE_PATHS=(
  "apps/api/src"
  "apps/api/scripts"
  "apps/mobile/src"
  "packages/shared/src"
  "apps/api/prisma/schema.prisma"
  "apps/api/test-pipeline.ts"
)

scan_active "/search/events/click|events/click|SearchResultClickDto|recordResultClick" \
  "stale search click endpoint or DTO still exists" \
  "${ACTIVE_PATHS[@]}"

scan_active "SearchLogSource|search_log_source|source\\s*=\\s*'search'|source:\\s*SearchLogSource" \
  "old SearchLogSource/source search-log semantics still exist" \
  "${ACTIVE_PATHS[@]}"

scan_active "EntityPriority|entityPriority|collection_entity_priority_metrics" \
  "old EntityPriority metrics owner still exists in active code/schema" \
  "${ACTIVE_PATHS[@]}"

scan_active "@@unique\\(\\[searchRequestId, entityId\\]" \
  "search log uniqueness still drops multi-market attribution rows" \
  "apps/api/prisma/schema.prisma"

if ! rg -n "uq_search_log_request_entity_market" \
  "apps/api/prisma/schema.prisma" \
  "apps/api/prisma/migrations" \
  >/dev/null; then
  fail "search log idempotency must be documented and enforced by uq_search_log_request_entity_market"
fi

if ! rg -n "uq_search_demand_daily_scope" \
  "apps/api/prisma/schema.prisma" \
  "apps/api/prisma/migrations" \
  >/dev/null; then
  fail "daily demand idempotency must be documented and enforced by uq_search_demand_daily_scope"
fi

if ! rg -n "uq_demand_scoring_candidate_scope" \
  "apps/api/prisma/schema.prisma" \
  "apps/api/prisma/migrations" \
  >/dev/null; then
  fail "scoring trace idempotency must be documented and enforced by uq_demand_scoring_candidate_scope"
fi

scan_active "@@unique\\(\\[term, entityType, reason, marketKey\\]" \
  "on-demand actionable state uniqueness must include entity identity lanes" \
  "apps/api/prisma/schema.prisma"

if ! rg -n "entityIdentityKey" \
  "apps/api/prisma/schema.prisma" \
  >/dev/null; then
  fail "on-demand actionable state must persist entityIdentityKey"
fi

if ! rg -n "term_entityType_reason_marketKey_entityIdentityKey" \
  "apps/api/src/modules/search/on-demand-request.service.ts" \
  >/dev/null; then
  fail "on-demand request upsert must use entityIdentityKey in the compound state key"
fi

if ! rg -n "entityIdentityKey.*request\\.entityIdentityKey|request\\.entityIdentityKey" \
  "apps/api/src/modules/search/on-demand-request.service.ts" \
  >/dev/null; then
  fail "on-demand queue cooldown keys must include entityIdentityKey"
fi

if ! rg -n "buildSearchLogAttributionScopes|collectableMarketKeyValues" \
  "apps/api/src/modules/search/search.service.ts" \
  >/dev/null; then
  fail "search log writer must fan out UI market attribution to collectable market scope"
fi

scan_active "onDemandRequestUser\\.[a-zA-Z]+\\([^)]*createdAt|createdAt:\\s*seenAt|where:\\s*\\{\\s*createdAt:" \
  "on-demand request user still uses createdAt as last-seen demand state" \
  "apps/api/src/modules/search" \
  "apps/api/src/modules/content-processing/reddit-collector"

scan_active "cutoffByKey\\.set\\(key, row\\.lastSeenAt\\)" \
  "on-demand queue cooldown still uses raw demand lastSeenAt instead of lastQueuedAt" \
  "apps/api/src/modules/search/on-demand-request.service.ts"

scan_active "HOT_SPIKE_ABSOLUTE_DISTINCT_USERS|HOT_SPIKE_TREND_DISTINCT_USERS|HOT_SPIKE_TREND_MULTIPLIER|HOT_SPIKE_ATTEMPT_THROTTLE_MS" \
  "on-demand hot spike ranking still uses old hard threshold constants" \
  "apps/api/src/modules/content-processing/reddit-collector"

scan_active "SEARCH_ON_DEMAND_MAX_INSTANT|SEARCH_ON_DEMAND_INSTANT|SEARCH_INTEREST_MAX_INSTANT|SEARCH_INTEREST_INSTANT|instantCooldownMs|maxImmediateWaiting|maxImmediateActive" \
  "on-demand config must not expose stale instant/immediate enqueue vocabulary" \
  "apps/api/src" \
  "apps/api/.env.example"

scan_active "const collectableMarketKey\\s*=\\s*row\\.marketKey" \
  "on-demand hot spike must use stored ask-event collectableMarketKey, not UI marketKey" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-search-scheduler.service.ts"

if rg -n "const final = scoredCandidates\\.slice" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-search-scheduler.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "on-demand hot spike must filter zero-availability candidates before selecting final jobs"
fi

if ! rg -n "selectableCandidates|attempt_availability_zero|DemandScoringDecisionState\\.gate_reject" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-search-scheduler.service.ts" \
  >/dev/null; then
  fail "on-demand hot spike must trace zero-availability candidates as gate rejects"
fi

if ! rg -n "collectableMarketKey:\\s*true" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-search-scheduler.service.ts" \
  >/dev/null; then
  fail "on-demand hot spike ask-event query must select collectableMarketKey"
fi

scan_active "POLL_DEFAULT_COOLDOWN_DAYS|POLL_TREND_COOLDOWN_DAYS|POLL_TREND_MIN_IMPRESSIONS" \
  "poll topic planning still uses old hard cooldown exception envs" \
  "apps/api/src/modules/polls"

scan_active "demand_date\\s*<=\\s*\\$\\{[^}]+\\}::date" \
  "demand aggregate readers must use half-open date windows" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts"

scan_active "demand_date\\s*[<>]=?\\s*\\$\\{(since|untilExclusive|startDate|endDateExclusive|recencyReferenceDate)\\}::date" \
  "demand aggregate date comparisons must use formatted date keys, not timestamp-to-date casts" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts"

scan_active "(logged_at|asked_at|last_viewed_at|created_at)\\s*[<>]=?\\s*\\$\\{(startDate|endDateExclusive)\\}" \
  "demand aggregate source windows must use formatted date keys, not JS Date parameters" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts"

scan_active "DATE\\((logged_at|e\\.asked_at|ev\\.viewed_at|fav\\.created_at)\\)" \
  "demand aggregate bucket assignment must use explicit date casts" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts"

scan_active "logged_at AT TIME ZONE 'UTC'" \
  "user_search_logs.logged_at is timestamp without time zone; bucket it with logged_at::date to avoid local-date shifts" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts"

if ! rg -n "logged_at::date" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  >/dev/null; then
  fail "search-log demand bucket assignment must use logged_at::date"
fi

if ! rg -n "e\\.asked_at AT TIME ZONE 'UTC'|ev\\.viewed_at AT TIME ZONE 'UTC'|fav\\.occurred_at AT TIME ZONE 'UTC'" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  >/dev/null; then
  fail "timestamptz demand fact bucket assignment must use explicit UTC timezone"
fi

if ! rg -n "resolveOrEnsureLocalityForActiveIntent" \
  "apps/api/src/modules/markets/market-registry.service.ts" \
  >/dev/null; then
  fail "active no-market point intent must still be able to create locality demand scope"
fi

if rg -n "activeLocalityMarket|selected\\s*=\\s*activeLocalityMarket" \
  "apps/api/src/modules/markets/market-registry.service.ts" \
  >/dev/null; then
  fail "active locality bootstrap must not force UI/search market ahead of normal coverage selection"
fi

if [[ "$(rg -n "AND collectable_market_key IS NOT NULL" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  | wc -l | tr -d ' ')" -lt 3 ]]; then
  fail "collectable demand inserts must only materialize collectable-scoped raw rows"
fi

if [[ "$(rg -n "AND market_key IS NOT NULL" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  | wc -l | tr -d ' ')" -lt 3 ]]; then
  fail "UI demand inserts must only materialize UI-market-scoped raw rows"
fi

if ! rg -n "metadata#>>'\\{submissionContext,selectedEntityId\\}' = entity_id::text" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  >/dev/null; then
  fail "autocomplete_selection demand must require the selected entity id to match the attributed entity"
fi

if ! rg -n "cacheSelectionPolicy|sourceEventKindCounts" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  >/dev/null; then
  fail "autocomplete_selection demand must preserve backend/cache provenance while treating selection as full intent"
fi

scan_active "demand_date\\s*[<>]=?\\s*\\$\\{params\\.(since|trendSince)\\}::date" \
  "keyword demand readers must use formatted date keys, not timestamp-to-date casts" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts"

scan_active "DATE\\(e\\.asked_at\\) AS demand_date,[[:space:]]*e\\.user_id,[[:space:]]*market_key,[[:space:]]*market_key" \
  "on-demand aggregate must not copy UI market scope into collectable scope" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts"

scan_active "THEN LOWER\\(TRIM\\(e\\.market_key\\)\\)" \
  "on-demand aggregate collectable scope must come from collectable_market_key, not UI market_key" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts"

if ! rg -n "collectableMarketKey\\s+String\\?" \
  "apps/api/prisma/schema.prisma" \
  >/dev/null; then
  fail "on-demand ask events must persist collectableMarketKey as a raw fact"
fi

if ! rg -n "askedAt\\s+DateTime.*@db\\.Timestamptz" \
  "apps/api/prisma/schema.prisma" \
  >/dev/null; then
  fail "on-demand ask event timestamps must be modeled as timestamptz to match the DB contract"
fi

if ! rg -n "collectableMarketKey," \
  "apps/api/src/modules/search/on-demand-request.service.ts" \
  >/dev/null; then
  fail "on-demand ask event writer must store collectableMarketKey"
fi

scan_active "LOWER\\(mp\\.market_key\\),[[:space:]]*LOWER\\(mp\\.market_key\\)" \
  "entity view/favorite aggregates must verify collectable scope instead of copying UI market scope" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts"

scan_active "FROM user_(restaurant|food)_views|FROM user_favorites" \
  "keyword collection demand must read user_search_demand_daily instead of raw app-intent tables" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts"

scan_active "source_kind = '(restaurant_view|food_view|favorite)'|signal_kind = '(restaurant_view|food_view|favorite)'|favorite_counts|restaurant_views|food_views" \
  "keyword collection must not read global-only view/favorite facts as collectable-scoped demand" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts"

if ! rg -n "JOIN core_markets m" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  >/dev/null; then
  fail "on-demand collectable aggregate scope must verify active collectable core market"
fi

if ! rg -n "scopeMode:\\s*'global'" \
  "apps/api/src/modules/search/search-query-suggestion.service.ts" \
  "apps/api/src/modules/search/search-popularity.service.ts" \
  >/dev/null; then
  fail "global demand consumers must opt into explicit global-scope demand"
fi

if ! rg -n "scope', 'global'" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  >/dev/null; then
  fail "global demand must be materialized as explicit null-scope aggregate rows"
fi

if ! rg -n "scope', 'ui_market'|insertSearchLogEntityUiMarketSignals|insertSearchLogQueryUiMarketSignals|insertAutocompleteSelectionUiMarketSignals" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  >/dev/null; then
  fail "UI-market demand must be materialized as explicit collectable-null aggregate rows"
fi

if ! rg -n "scope', 'collectable_market'|insertSearchLogEntityCollectableSignals|insertSearchLogQueryCollectableSignals|insertAutocompleteSelectionCollectableSignals" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  >/dev/null; then
  fail "collectable demand must be materialized as explicit market-null aggregate rows"
fi

if [[ "$(rg -n "collectable_market_key IS NULL" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  | wc -l | tr -d ' ')" -lt 3 ]]; then
  fail "UI demand readers must consume collectable-null aggregate rows instead of collectable fanout"
fi

if ! rg -n "LOWER\\(collectable_market_key\\) = LOWER\\(\\$\\{collectableMarketKey\\}\\).*|market_key IS NULL" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  >/dev/null; then
  fail "collectable demand readers must consume market-null aggregate rows instead of UI fanout"
fi

if ! rg -n "market_key IS NULL AND collectable_market_key IS NULL" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  >/dev/null; then
  fail "global demand readers must consume explicit null-scope aggregate rows"
fi

scan_active "searchLog\\.groupBy|_count:\\s*\\{\\s*_all:\\s*true\\s*\\}" \
  "fresh search-log overlays must dedupe by event identity, not count attribution rows" \
  "apps/api/src/modules/search/search-popularity.service.ts"

if ! rg -n "SELECT DISTINCT" \
  "apps/api/src/modules/search/search-popularity.service.ts" \
  >/dev/null || ! rg -n "COALESCE\\(search_request_id::text, log_id::text\\) AS \"eventKey\"" \
  "apps/api/src/modules/search/search-popularity.service.ts" \
  >/dev/null; then
  fail "fresh popularity overlays must count distinct search events per entity"
fi

if rg -n "logged_at >= \\$\\{this\\.startOfUtcDay\\(new Date\\(\\)\\)\\}" \
  "apps/api/src/modules/search/search-popularity.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "fresh popularity overlays must compare user_search_logs.logged_at to formatted UTC date keys, not Date parameters"
fi

if ! rg -n "logged_at >= \\$\\{todayKey\\}::date|formatDateKey\\(this\\.startOfUtcDay\\(new Date\\(\\)\\)\\)" \
  "apps/api/src/modules/search/search-popularity.service.ts" \
  >/dev/null; then
  fail "fresh popularity overlays must use a formatted UTC date key for today's timestamp-without-time-zone window"
fi

if rg -n "LOWER\\(collectable_market_key\\) = \\$\\{normalizedMarketKey\\}|OR LOWER\\(collectable_market_key\\)" \
  "apps/api/src/modules/search/search-popularity.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "fresh UI-market popularity overlays must not leak collectable scope into UI autocomplete"
fi

if ! rg -n "until:\\s*this\\.startOfUtcDay\\(new Date\\(\\)\\)" \
  "apps/api/src/modules/search/search-popularity.service.ts" \
  >/dev/null; then
  fail "fresh popularity overlays must own today instead of double-counting today from the aggregate"
fi

if ! rg -n "COALESCE\\(search_request_id::text, log_id::text\\) AS event_key" \
  "apps/api/src/modules/search/search-query-suggestion.service.ts" \
  "apps/api/src/modules/search/search.service.ts" \
  >/dev/null; then
  fail "personal query suggestions and recents must dedupe fanned search rows by event identity"
fi

if rg -n "logged_at >= \\$\\{this\\.defaultSince\\(\\)\\}" \
  "apps/api/src/modules/search/search-query-suggestion.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "personal query raw windows must compare user_search_logs.logged_at to formatted UTC timestamp keys, not Date parameters"
fi

if ! rg -n "formatTimestampWithoutTimeZoneKey\\(this\\.defaultSince\\(\\)\\)|logged_at >= \\$\\{sinceKey\\}::timestamp" \
  "apps/api/src/modules/search/search-query-suggestion.service.ts" \
  >/dev/null; then
  fail "personal query raw windows must use timestamp-without-time-zone bounds"
fi

if rg -n "remaining <= 0" \
  "apps/api/src/modules/search/search-query-suggestion.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "query suggestions must fetch global lane independently instead of returning after personal rows fill the request budget"
fi

if ! rg -n "suggestionSourceByKey\\.set\\(key, 'global'\\)|suggestionSourceByKey\\.get\\(key\\)" \
  "apps/api/src/modules/search/search-query-suggestion.service.ts" \
  >/dev/null; then
  fail "query suggestion hydration must preserve the lane that produced each candidate"
fi

if rg -n "querySuggestions[\\s\\S]*slice\\(0, Math\\.max\\(1, this\\.querySuggestionMax\\)\\)" \
  "apps/api/src/modules/autocomplete/autocomplete.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "autocomplete must split personal/global query lanes before applying final query suggestion caps"
fi

if ! rg -n "laneRank - b\\.laneRank" \
  "apps/api/src/modules/autocomplete/autocomplete.service.ts" \
  >/dev/null; then
  fail "autocomplete query lane reserved slots must preserve upstream personal recency/global demand order"
fi

if ! rg -n "reserveTotal|params\\.limit < reserveTotal|entityOverflowStart = 1" \
  "apps/api/src/modules/autocomplete/autocomplete.service.ts" \
  >/dev/null; then
  fail "autocomplete lane merge must preserve lane representation even for small requested limits"
fi

if rg -n "existing\\.signalCount \\+= 1|counts\\.set\\(key, \\(counts\\.get\\(key\\) \\?\\? 0\\) \\+ 1\\)" \
  "apps/api/src/modules/search/search-query-suggestion.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "personal query counts must not increment once per attribution row"
fi

if ! rg -n "d\\.market_key IS NULL" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts" \
  >/dev/null; then
  fail "keyword global demand reader must use explicit global aggregate scope"
fi

if [[ "$(rg -n "market_key IS NULL" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts" \
  | wc -l | tr -d ' ')" -lt 3 ]]; then
  fail "keyword collectable demand readers must consume collectable-only aggregate rows"
fi

if ! rg -n "asked_at >= \\(\\$\\{this\\.formatDateKey\\([^}]+\\)\\}::date::timestamp AT TIME ZONE 'UTC'\\)" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts" \
  >/dev/null; then
  fail "keyword on-demand fact readers must use explicit UTC timestamptz windows"
fi

if ! rg -n "if \\(!requests\\.length\\)" \
  "apps/api/src/modules/search/on-demand-request.service.ts" \
  >/dev/null; then
  fail "on-demand cooldown filtering must short-circuit empty queue target sets"
fi

if ! rg -n "ATTRIBUTE_LANE_RUNTIME_READY = true" \
  "apps/api/src/modules/autocomplete/autocomplete.service.ts" \
  >/dev/null; then
  fail "attribute autocomplete lane must be runtime-promoted after strict support gates land"
fi

if ! rg -n "resolveAttributeEntityTypes|searchAttributeAutocompleteEntities" \
  "apps/api/src/modules/autocomplete/autocomplete.service.ts" \
  "apps/api/src/modules/autocomplete/entity-search.service.ts" \
  "apps/api/src/modules/entity-text-search/entity-text-search.service.ts" \
  >/dev/null; then
  fail "attribute autocomplete must use a dedicated first-class lane and strict text profile"
fi

if ! rg -n "ATTRIBUTE_TYPED_SEARCH_WEIGHT|ATTRIBUTE_SELECTION_WEIGHT|ATTRIBUTE_CORPUS_WEIGHT|normalizeAttributeCorpusUsefulness|corpusSelectivity" \
  "apps/api/src/modules/autocomplete/autocomplete.service.ts" \
  >/dev/null; then
  fail "attribute autocomplete support must combine typed demand, selection validation, and corpus selectivity"
fi

if ! rg -n "DemandSignalKind\\.autocomplete_selection" \
  "apps/api/src/modules/autocomplete/autocomplete.service.ts" \
  >/dev/null; then
  fail "attribute autocomplete support must include autocomplete selection validation demand"
fi

if ! rg -n "scoped_restaurants|ST_Covers\\(" \
  "apps/api/src/modules/autocomplete/autocomplete.service.ts" \
  >/dev/null; then
  fail "attribute autocomplete corpus support must be scoped to the resolved market"
fi

if ! rg -n "marketKey: normalizedMarketKey" \
  "apps/api/src/modules/entity-text-search/entity-text-search.service.ts" \
  >/dev/null; then
  fail "attribute autocomplete text search must carry market scope into the shared text-search cache/profile"
fi

if ! rg -n "applySelectedAutocompleteEntity" \
  "apps/api/src/modules/search/search-query-interpretation.service.ts" \
  >/dev/null; then
  fail "selected autocomplete entities must be authoritative search execution targets"
fi

if ! rg -n "hasSelectedAutocompleteEntity" \
  "apps/api/src/modules/search/search-query-interpretation.service.ts" \
  >/dev/null; then
  fail "selected autocomplete entities must suppress LLM unresolved side effects"
fi

if ! rg -n "buildSelectedEntitySearchRequest" \
  "apps/api/src/modules/search/search-orchestration.service.ts" \
  >/dev/null; then
  fail "selected autocomplete entities must bypass generic-only/LLM routing and execute the selected id"
fi

scan_active ":global:\\$\\{queryToken\\}|:global:" \
  "autocomplete cache key must include resolved market scope instead of hard-coded global scope" \
  "apps/api/src/modules/autocomplete/autocomplete.service.ts"

if rg -n "DemandSignalKind\\.cache" \
  "apps/api/src/modules/search/search-query-suggestion.service.ts" \
  | rg -v "personalRows|userRows|signalKinds: \\[DemandSignalKind.backend, DemandSignalKind.cache\\]" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "global query suggestions must not include cache rows by default"
fi

scan_active "DemandSignalKind\\.autocomplete_selection" \
  "global query suggestions must not read autocomplete_selection rows until query-level selection facts exist" \
  "apps/api/src/modules/search/search-query-suggestion.service.ts"

if ! rg -n "compareGlobalRows|distinctUsers" \
  "apps/api/src/modules/search/search-query-suggestion.service.ts" \
  >/dev/null; then
  fail "global query suggestions must be distinct-user dominant"
fi

scan_active "0 AS \"nameSimilarity\"" \
  "entity prefix autocomplete matches must carry non-zero lexical confidence" \
  "apps/api/src/modules/entity-text-search/entity-text-search.service.ts"

if ! rg -n "length\\(v\\.term\\) <= 2 THEN 0\\.9" \
  "apps/api/src/modules/entity-text-search/entity-text-search.service.ts" \
  >/dev/null; then
  fail "entity prefix text match must use explicit prefix confidence"
fi

if ! rg -n "WHEN lower\\(e\\.name\\) LIKE v\\.prefix_pattern THEN 0\\.94" \
  "apps/api/src/modules/entity-text-search/entity-text-search.service.ts" \
  >/dev/null; then
  fail "entity text search must score longer prefix matches with explicit lexical confidence"
fi

if ! rg -n "lower\\(e\\.name\\) LIKE v\\.prefix_pattern" \
  "apps/api/src/modules/entity-text-search/entity-text-search.service.ts" \
  >/dev/null; then
  fail "entity text search must treat longer prefixes as eligible lexical matches"
fi

if ! rg -n "options\\.allowPhonetic !== undefined \\? options\\.allowPhonetic" \
  "apps/api/src/modules/entity-text-search/entity-text-search.service.ts" \
  >/dev/null; then
  fail "entity text search must honor caller-provided phonetic profile"
fi

if ! rg -n "allowPhonetic: false" \
  "apps/api/src/modules/autocomplete/autocomplete.service.ts" \
  >/dev/null; then
  fail "user-facing autocomplete entity lane must not use raw phonetic-only rescue"
fi

if ! rg -n "phonetic:on|phonetic:off" \
  "apps/api/src/modules/entity-text-search/entity-text-search.service.ts" \
  >/dev/null; then
  fail "entity text search cache key must include phonetic profile identity"
fi

if ! rg -n "return 'prefix'" \
  "apps/api/src/modules/entity-text-search/entity-text-search.service.ts" \
  >/dev/null; then
  fail "entity text match evidence must distinguish prefix matches"
fi

if ! rg -n "weightedEventCount|cacheWeight: 0\\.35" \
  "apps/api/src/modules/search/search-popularity.service.ts" \
  >/dev/null; then
  fail "fresh entity popularity overlay must downweight cache rows for community/global popularity"
fi

if ! rg -n "isAutocompleteSelection|submissionContext,selectedEntityId|WHEN \"isAutocompleteSelection\" THEN 1\\.5" \
  "apps/api/src/modules/search/search-popularity.service.ts" \
  >/dev/null; then
  fail "fresh entity popularity overlay must apply same-day autocomplete selection intent before daily aggregate rebuilds"
fi

if ! rg -n "restaurantAttributes\\?\\.length" \
  "apps/api/src/modules/search/search.service.ts" \
  >/dev/null; then
  fail "low-result on-demand coverage must include restaurant-attribute searches"
fi

if ! rg -n "let globalRows = eligibleScopedGlobalRows" \
  "apps/api/src/modules/search/search-query-suggestion.service.ts" \
  >/dev/null; then
  fail "global query suggestion candidate pool must exclude ineligible scoped rows"
fi

if ! rg -n "const fallbackRows = this\\.filterEligibleGlobalRows" \
  "apps/api/src/modules/search/search-query-suggestion.service.ts" \
  >/dev/null; then
  fail "global query suggestion fallback rows must pass the same distinct-user eligibility gate"
fi

if ! rg -n "filterEligibleGlobalRows|eligibleScopedGlobalRows\\.length < safeLimit" \
  "apps/api/src/modules/search/search-query-suggestion.service.ts" \
  >/dev/null; then
  fail "global query suggestion fallback must be based on eligible scoped rows, not raw scoped row count"
fi

if ! rg -n "totalRestaurantResults,\\s*$" \
  "apps/api/src/modules/search/search.service.ts" \
  >/dev/null; then
  fail "low-result on-demand gate must use total restaurant coverage, not current page count"
fi

if rg -n "dto\\.cacheRevealRequestId \\?\\? randomUUID\\(\\)|cacheRevealRequestId\\?: string" \
  "apps/api/src/modules/search" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "cache reveal attribution must require a retry-stable cacheRevealRequestId"
fi

if ! rg -n "cacheRevealRequestId is required" \
  "apps/api/src/modules/search/search.service.ts" \
  >/dev/null; then
  fail "cache reveal attribution must reject missing cacheRevealRequestId"
fi

if rg -n "request\\.bounds && resolvedMarket\\.marketKey|const collectableMarketKeys = request\\.bounds" \
  "apps/api/src/modules/search/search-query-interpretation.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "user-location-only unresolved demand must preserve resolved market scope"
fi

if rg -n "const onDemandMarketContext = request\\.bounds" \
  "apps/api/src/modules/search/search.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "user-location-only low-result demand must preserve resolved market scope"
fi

if rg -n "Math\\.max\\(params\\.restaurantCount, params\\.foodCount" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "keyword low-result severity must use restaurant coverage first, not max(food, restaurant)"
fi

if rg -n "FAVORITE_USERS_CAP|CARD_ENGAGEMENT_USERS_CAP|EXPLICIT_SELECTION_USERS_CAP|QUERY_USERS_PRIMARY_CAP|normalizeLog" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "keyword demand scoring must not re-cap shared demand units"
fi

if rg -n "0\\.7 \\+ 0\\.3 \\* Math\\.exp\\(-safeDaysSinceLastSeen / 7\\)" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "keyword unmet recency must use current-cycle grace plus half-life decay"
fi

if rg -n "seenCoverageKeys" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-search-scheduler.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "hot-spike selection must not hide a one-term-per-market cap"
fi

if ! rg -n "shouldApplySmoothNoResultsRecovery" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts" \
  >/dev/null; then
  fail "keyword no-results attempts must use smooth recovery instead of hard cooldown drop"
fi

if ! rg -n "traceScope.*all_candidate" \
  "apps/api/src/modules/polls/poll-scheduler.service.ts" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-search-scheduler.service.ts" \
  >/dev/null; then
  fail "trace-all mode must mark debug-only candidates for short retention"
fi

if rg -n "traceAllCandidates:\\s*true,[[:space:]]*startedAt:\\s*\\{ lt: traceAllCutoff \\}" \
  "apps/api/src/modules/analytics/demand-scoring-trace.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "trace-all pruning must not delete selected/near-miss runs after debug retention"
fi

if ! rg -n "rankReadyTopicsForPublish|await this\\.refreshTopics\\(\\)" \
  "apps/api/src/modules/polls/poll-scheduler.service.ts" \
  >/dev/null; then
  fail "poll publishing must refresh/rerank topics before launch"
fi

if ! rg -n "phase: 'publish'|poll_published" \
  "apps/api/src/modules/polls/poll-scheduler.service.ts" \
  >/dev/null; then
  fail "poll publishing must write publish-time scoring traces"
fi

if ! rg -n "ready_topic_carried_forward" \
  "apps/api/src/modules/polls/poll-scheduler.service.ts" \
  >/dev/null; then
  fail "ready poll topics must not be traced as failed gate rejects"
fi

if rg -n "minImpressions|impressions" \
  "apps/api/src/modules/analytics/search-demand.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "search demand service must expose demandScore/signalCount naming, not impression naming"
fi

if ! rg -n "minDemandScore: params\\.minDemandScore" \
  "apps/api/src/modules/analytics/search-demand.service.ts" \
  >/dev/null; then
  fail "poll active-market gate must use demandScore, not raw signal_count"
fi

if ! rg -n "marketKey:\\s*params\\.marketKey" \
  "apps/api/src/modules/polls/poll-scheduler.service.ts" \
  >/dev/null; then
  fail "poll scoring trace candidates must record marketKey"
fi

if ! rg -n "collectableMarketKey:\\s*params\\.collectableMarketKey" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts" \
  >/dev/null; then
  fail "keyword scoring trace candidates must record collectableMarketKey"
fi

if ! rg -n "attempt_cooldown_active|duplicate_keyword_term|generic_only_keyword|invalid_normalized_keyword" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts" \
  >/dev/null; then
  fail "keyword scoring traces must include meaningful gate and dedupe rejects"
fi

if ! rg -n "fixture poor restaurant rich food" \
  "apps/api/scripts/validate-demand-scoring-fixtures.ts" \
  >/dev/null; then
  fail "on-demand fixtures must protect restaurant-first low-result severity"
fi

if ! rg -n "sameMarketSelectedAtLeast:\\s*2" \
  "apps/api/scripts/validate-demand-scoring-fixtures.ts" \
  >/dev/null; then
  fail "hot-spike fixtures must prove multiple strong same-market candidates can be selected"
fi

if ! rg -n 'GROUP BY "entityId", "userId"' \
  "apps/api/src/modules/search/search-popularity.service.ts" \
  >/dev/null; then
  fail "fresh search popularity overlay must preserve per-user log demand shape"
fi

if ! rg -n -F 'SUM(LN(1 + "weightedEventCount") / LN(2))' \
  "apps/api/src/modules/search/search-popularity.service.ts" \
  >/dev/null; then
  fail "fresh search popularity overlay must score per-user weighted counts logarithmically"
fi

if ! rg -n "MIN_SELECTABLE_SCORE_BY_SLICE" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts" \
  >/dev/null; then
  fail "keyword soft reservations must not force singleton weak candidates into reserved slots"
fi

if rg -n "fallbackCoverageKey|safeIntervalDays:\\s*7,[[:space:]]*terms:\\s*\\[\\]" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-search-scheduler.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "keyword scheduler must fail selection errors instead of keeping fallback empty schedules alive"
fi

if ! rg -n "saffron single user|scones cache replay" \
  "apps/api/scripts/validate-demand-scoring-fixtures.ts" \
  >/dev/null; then
  fail "query suggestion fixtures must protect distinct-user and backend-only global semantics"
fi

if ! rg -n "fresh popularity overlay" \
  "apps/api/scripts/validate-demand-scoring-fixtures.ts" \
  >/dev/null; then
  fail "fixtures must protect same-day popularity overlay per-user scoring"
fi

if ! rg -n "autocompleteSelectedScore|selectionScoreExceedsPlainBackend" \
  "apps/api/scripts/validate-demand-scoring-fixtures.ts" \
  >/dev/null; then
  fail "fixtures must protect same-day autocomplete selection popularity overlay weight"
fi

if ! rg -n "cache attribution aggregation" \
  "apps/api/scripts/validate-demand-scoring-fixtures.ts" \
  >/dev/null; then
  fail "fixtures must protect cache attribution through demand aggregation"
fi

if ! rg -n "query suggestions aggregation" \
  "apps/api/scripts/validate-demand-scoring-fixtures.ts" \
  >/dev/null; then
  fail "fixtures must protect raw query logs through query suggestion aggregation"
fi

if ! rg -n "poll publish: weekly publish refreshes, reranks" \
  "apps/api/scripts/validate-demand-scoring-fixtures.ts" \
  >/dev/null; then
  fail "fixtures must protect poll publish-time rerank and trace behavior"
fi

if ! rg -n "server recents: cache rerun moves query to top" \
  "apps/api/scripts/validate-demand-scoring-fixtures.ts" \
  >/dev/null; then
  fail "fixtures must protect server recents fanout/cache dedupe behavior"
fi

if ! rg -n "view/favorite demand: append-only app-intent events aggregate globally" \
  "apps/api/scripts/validate-demand-scoring-fixtures.ts" \
  >/dev/null; then
  fail "fixtures must protect view/favorite global-only demand boundary"
fi

if ! rg -n "fixture harness: service warnings/errors stay clean" \
  "apps/api/scripts/validate-demand-scoring-fixtures.ts" \
  >/dev/null; then
  fail "fixtures must fail on unexpected service warnings or errors"
fi

if ! rg -n "autocomplete public assembly" \
  "apps/api/scripts/validate-demand-scoring-fixtures.ts" \
  >/dev/null; then
  fail "fixtures must protect public autocomplete lane assembly"
fi

if rg -n "attributeCandidates\\.slice\\(ATTRIBUTE_RESERVED_SLOTS\\)" \
  "apps/api/src/modules/autocomplete/autocomplete.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "autocomplete attribute lane must remain a single gated slot and must not backfill overflow"
fi

if ! rg -n "keyword live loaders" \
  "apps/api/scripts/validate-demand-scoring-fixtures.ts" \
  >/dev/null; then
  fail "keyword fixtures must exercise live unmet/refresh/demand loader paths"
fi

scan_active "traceAllCandidates:\\s*false" \
  "batch scoring traces must use a tuning flag instead of hardcoded all-candidate tracing" \
  "apps/api/src/modules/polls/poll-scheduler.service.ts" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-search-scheduler.service.ts"

scan_active "entity priority|M05" \
  "keyword scheduler active comments must not keep stale entity-priority ownership language" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-search-scheduler.service.ts"

if ! rg -n "COALESCE\\(\"market_key\", ''\\)" \
  "apps/api/prisma/migrations/20260514214500_demand_scoring_traces/migration.sql" \
  >/dev/null; then
  fail "demand scoring candidate trace uniqueness must include market scope"
fi

if ! rg -n "COALESCE\\(\"collectable_market_key\", ''\\)" \
  "apps/api/prisma/migrations/20260514214500_demand_scoring_traces/migration.sql" \
  >/dev/null; then
  fail "demand scoring candidate trace uniqueness must include collectable market scope"
fi

if ! rg -n '"entity_id"' \
  "apps/api/prisma/migrations/20260515204000_trace_identity_scope/migration.sql" \
  >/dev/null; then
  fail "demand scoring candidate trace uniqueness must include entity id lanes"
fi

if ! rg -n '"entity_type"' \
  "apps/api/prisma/migrations/20260515204000_trace_identity_scope/migration.sql" \
  >/dev/null; then
  fail "demand scoring candidate trace uniqueness must include entity type lanes"
fi

if ! rg -n "NULLS NOT DISTINCT" \
  "apps/api/prisma/migrations/20260515204000_trace_identity_scope/migration.sql" \
  >/dev/null; then
  fail "demand scoring candidate trace uniqueness must treat null identity/scope fields as equal"
fi

if ! rg -n '"entity_id"' \
  apps/api/prisma/migrations/20260515195000_search_demand_daily_identity_scope/migration.sql \
  >/dev/null; then
  fail "user_search_demand_daily uniqueness must include entity_id so term demand can keep distinct entity lanes"
fi

if ! rg -n '"entity_type"' \
  apps/api/prisma/migrations/20260515195000_search_demand_daily_identity_scope/migration.sql \
  >/dev/null; then
  fail "user_search_demand_daily uniqueness must include entity_type so term demand can keep distinct entity lanes"
fi

if ! rg -n "NULLS NOT DISTINCT" \
  apps/api/prisma/migrations/20260515195000_search_demand_daily_identity_scope/migration.sql \
  >/dev/null; then
  fail "user_search_demand_daily uniqueness must treat null identity/scope fields as equal"
fi

if ! rg -n "pg_try_advisory_xact_lock" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  >/dev/null; then
  fail "search demand aggregate cron lock must be transaction-scoped"
fi

scan_active "pg_try_advisory_lock|pg_advisory_unlock" \
  "search demand aggregate cron must not use session-scoped advisory locks through Prisma pooling" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts"

if rg -n "INSERT INTO user_search_demand_daily|userSearchDemandDaily\\.|searchDemandDaily\\." \
  "apps/api/src" \
  | rg -v "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  | rg -v "apps/api/src/modules/restaurant-enrichment/restaurant-entity-merge.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "user_search_demand_daily must only be written by SearchDemandAggregationService or the restaurant merge rehome path"
fi

if ! rg -n "rehomeSearchDemandDailyRows" \
  "apps/api/src/modules/restaurant-enrichment/restaurant-entity-merge.service.ts" \
  >/dev/null; then
  fail "restaurant entity merge must explicitly rehome demand aggregate rows"
fi

if ! rg -n "entityIdentityKey:\\s*canonicalId" \
  "apps/api/src/modules/restaurant-enrichment/restaurant-entity-merge.service.ts" \
  >/dev/null; then
  fail "restaurant entity merge must rekey on-demand actionable state entity identity lanes"
fi

if ! rg -n "collectableMarketKey:\\s*log\\.collectableMarketKey" \
  "apps/api/src/modules/restaurant-enrichment/restaurant-entity-merge.service.ts" \
  >/dev/null; then
  fail "restaurant merge search-log rehome must preserve collectable-market scoped rows"
fi

if ! rg -n "marketKey:\\s*candidate\\.marketKey" \
  "apps/api/src/modules/restaurant-enrichment/restaurant-entity-merge.service.ts" \
  >/dev/null; then
  fail "restaurant merge score-trace rehome must preserve market-scoped candidates"
fi

if ! rg -n "collectableMarketKey:\\s*candidate\\.collectableMarketKey" \
  "apps/api/src/modules/restaurant-enrichment/restaurant-entity-merge.service.ts" \
  >/dev/null; then
  fail "restaurant merge score-trace rehome must preserve collectable-market scoped candidates"
fi

if ! rg -n "rehomeSubjectKey" \
  "apps/api/src/modules/restaurant-enrichment/restaurant-entity-merge.service.ts" \
  >/dev/null; then
  fail "restaurant merge must preserve term/query subject keys while rehoming entity context"
fi

if rg -n "subjectKey:\\s*canonicalId" \
  "apps/api/src/modules/restaurant-enrichment/restaurant-entity-merge.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "restaurant merge must not blindly overwrite term/query subjectKey with canonical restaurant id"
fi

if ! rg -n "userEntityViewEvent\\.updateMany" \
  "apps/api/src/modules/restaurant-enrichment/restaurant-entity-merge.service.ts" \
  >/dev/null; then
  fail "restaurant merge must rehome append-only user_entity_view_events facts before deleting duplicates"
fi

if ! rg -n "rehomeUserEntityViewEventConnections" \
  "apps/api/src/modules/restaurant-enrichment/restaurant-entity-merge.service.ts" \
  >/dev/null; then
  fail "restaurant connection merge must rehome append-only food view event connection facts"
fi

if ! rg -n "entityId \\?\\? 'no_entity'|composeEntityIdentityKey" \
  "apps/api/src/modules/search/on-demand-request.service.ts" \
  >/dev/null; then
  fail "on-demand request dedupe must include entity identity so raw ask facts are not collapsed"
fi

if ! rg -n "userFavoriteEvent\\.create" \
  "apps/api/src/modules/favorites/favorites.service.ts" \
  >/dev/null; then
  fail "favorite actions must write append-only user_favorite_events facts"
fi

if ! rg -n "FROM user_favorite_events" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  >/dev/null; then
  fail "daily favorite demand must rebuild from user_favorite_events facts"
fi

scan_active "private insert(Restaurant|Food)ViewSignals|private insertFavoriteSignals" \
  "view/favorite demand must remain global-only until append-only facts carry factual UI market scope" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts"

scan_active "FROM user_favorites fav" \
  "daily favorite demand must not rebuild from mutable favorite state" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts"

if ! rg -n "rehomeUserFavoriteEvents" \
  "apps/api/src/modules/restaurant-enrichment/restaurant-entity-merge.service.ts" \
  >/dev/null; then
  fail "restaurant merge must rehome append-only favorite facts before deleting duplicates"
fi

if rg -n "onDemandRequest\\.findMany|collection_on_demand_requests" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "keyword unmet demand selection must read raw ask-event facts, not cooldown-suppressed queue state"
fi

if ! rg -n "collection_on_demand_ask_events" \
  "apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts" \
  >/dev/null; then
  fail "keyword unmet demand selection must use append-only on-demand ask facts"
fi

if ! rg -n "userEntityViewEvent\\.create" \
  "apps/api/src/modules/history/history.service.ts" \
  >/dev/null; then
  fail "view demand must write append-only user_entity_view_events facts"
fi

if ! rg -n "FROM user_entity_view_events" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  >/dev/null; then
  fail "daily view demand must rebuild from user_entity_view_events facts"
fi

scan_active "FROM user_restaurant_views|FROM user_food_views|SUM\\(.*view_count" \
  "daily view demand must not rebuild from mutable view state tables" \
  "apps/api/src/modules/analytics/search-demand-aggregation.service.ts"

if rg -n "FROM user_search_logs|JOIN user_search_logs|COUNT\\(DISTINCT COALESCE\\(search_request_id" \
  "apps/api/src" \
  | rg -v "apps/api/src/modules/analytics/search-demand-aggregation.service.ts" \
  | rg -v "apps/api/src/modules/search/search-popularity.service.ts" \
  | rg -v "apps/api/src/modules/search/search-query-suggestion.service.ts" \
  | rg -v "apps/api/src/modules/search/search.service.ts" \
  >/tmp/search-demand-delete-gate.out; then
  cat /tmp/search-demand-delete-gate.out >&2
  fail "raw search-log demand reader exists outside SearchDemandAggregationService"
fi

if ! rg -n "DEMAND_SCORING_TRACE_ALL_RETENTION_DAYS" \
  "apps/api/src/modules/analytics/demand-scoring-trace.service.ts" \
  >/dev/null; then
  fail "score trace pruning must retain debug/all-candidate traces separately"
fi

if ! rg -n "search-demand:rebuild|rebuild-search-demand-daily" \
  package.json \
  apps/api/package.json \
  >/dev/null; then
  fail "daily demand aggregate must expose an explicit rebuild/backfill command"
fi

echo "search-demand-cutover-delete-gate: ok"
