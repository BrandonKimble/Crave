# Search Demand Layer Cutover Plan

## Status

Execution-ready target plan. This supersedes `plans/search-demand-layer-architecture-pass.md` and `plans/keyword-collection-priority-overhaul.md`.

Use `plans/search-demand-architecture-review.md` as the decision log and this file as the implementation sequence.

## Objective

Cut search demand from scattered raw-log readers into a small set of durable facts, rebuildable daily aggregates, and consumer-owned scoring decisions.

The target shape is:

```text
raw facts -> user_search_demand_daily -> consumer scoring runs -> runtime decisions
```

Not:

```text
each consumer queries user_search_logs and invents its own count semantics
```

## Ground Rules

- No query-level `search_events` table in v1.
- `user_search_logs` remains the durable attributed search-history table, but only for resolved entity attribution rows.
- Use short `eventKind` values: `backend` and `cache`.
- Cache reveal logging must clone server-owned backend attribution rows. Do not trust client-supplied entity ids.
- On-demand cooldown suppresses queue churn only. It must not suppress raw demand facts.
- Request-time autocomplete stays lightweight and untraced.
- Batch ranking decisions get durable score traces.
- Delete or rename old `EntityPriority*` owners during the keyword priority promotion.
- Keep Prometheus backend-load metrics separate from product demand.
- No non-exhaustive exception/deny lists for ranking eligibility.

## Phase 0: Delete Gates Before Schema Work

Add `scripts/search-demand-cutover-delete-gate.sh`.

The gate should fail on active runtime code if it finds:

- `/search/events/click`
- `SearchResultClickDto`
- new raw `COUNT(*)` or `COUNT(DISTINCT COALESCE(search_request_id, log_id))` demand consumers over `user_search_logs`
- `source = 'search'` as the primary demand filter after `eventKind` is promoted
- `SearchLogSource.poll`
- new `EntityPriority*` owners
- direct writes to `user_search_demand_daily` without a durable raw source fact
- autocomplete attribute lane enabled without support gates

Allow the old names only in superseded plans, historical migrations, and explicit delete-gate allowlists.

## Phase 1: Search Log Event Kind And Cache Attribution

### Schema

Replace the broad search-log source meaning with concrete event meaning.

In `SearchLog`:

- Add enum `SearchLogEventKind` mapped to `search_log_event_kind`:
  - `backend`
  - `cache`
- Add `eventKind SearchLogEventKind @default(backend) @map("event_kind")`.
- Backfill existing rows to `backend`.
- Drop `SearchLog.source` and `SearchLogSource` once all readers are migrated.
- Add indexes:
  - `[eventKind, loggedAt]`
  - `[userId, eventKind, queryText, loggedAt]`
  - `[marketKey, eventKind, loggedAt]`
  - `[collectableMarketKey, eventKind, loggedAt]`
- Replace the current `@@unique([searchRequestId, entityId])` constraint. It is too narrow for the target contract because one search can attribute the same entity into multiple markets. Use a raw SQL unique index with market coalescing:

```sql
UNIQUE (
  search_request_id,
  entity_id,
  COALESCE(market_key, '')
)
```

If the implementation needs to distinguish collectable scope separately, include `COALESCE(collectable_market_key, '')` too. Do not keep a uniqueness rule that silently drops multi-market attribution rows.

### Backend Search Writes

`SearchService.recordSearchLogEntries(...)` writes:

- `eventKind: backend`
- one row per attributed entity and attributed market
- one fresh backend `searchRequestId`
- existing totals, query text, market status, filters, and submission metadata

Keep the current attribution rule: selected autocomplete entity wins; otherwise use the most specific non-generic resolved entity.

### Cache Attribution Endpoint

Add a narrow protected endpoint:

```text
POST /search/cache-attribution
```

Request:

```json
{
  "originalBackendSearchRequestId": "uuid",
  "cacheRevealRequestId": "uuid",
  "cacheAgeMs": 12345,
  "resultsDataKey": "optional-client-cache-key"
}
```

Rules:

- `cacheRevealRequestId` is the new `searchRequestId` for idempotent retry.
- Server loads original rows by:
  - `search_request_id = originalBackendSearchRequestId`
  - `event_kind = backend`
  - same authenticated `user_id`
- If no original backend rows exist, return `{ inserted: 0 }` without creating synthetic attribution.
- Clone original attributed rows with:
  - `eventKind: cache`
  - `searchRequestId: cacheRevealRequestId`
  - `loggedAt: now`
  - copied entity, market, collectable market, query text, totals, and market status
  - metadata cache block:

```json
{
  "cache": {
    "originalBackendSearchRequestId": "uuid",
    "cacheRevealRequestId": "uuid",
    "cacheAgeMs": 12345,
    "resultsDataKey": "..."
  }
}
```

- Use `createMany({ skipDuplicates: true })` so retries do not duplicate rows.
- Do not increment `search_requests_total`.

## Phase 2: On-Demand Raw Ask Facts

The current `OnDemandRequestService.recordRequests(...)` filters by cooldown before it writes anything. That loses demand facts. Fix this first before any aggregate depends on on-demand.

### Schema

Add an append-only raw fact table:

```text
collection_on_demand_ask_events
```

Fields:

- `ask_event_id uuid primary key`
- `request_id uuid null`
- `user_id uuid null`
- `term varchar(255)`
- `entity_type entity_type`
- `entity_id uuid null`
- `reason on_demand_reason`
- `market_key varchar(255)` for the UI/search market where the ask happened
- `collectable_market_key varchar(255) null` for the executable collection market
- `result_restaurant_count int`
- `result_food_count int`
- `asked_at timestamptz`
- `metadata jsonb`

Keep actionable request state separate from raw asks:

- `collection_on_demand_requests` remains queue/cooldown state.
- Its uniqueness includes `term`, `entity_type`, `reason`, `market_key`, and
  `entity_identity_key`.
- `entity_identity_key` is the resolved entity id when present, otherwise
  `no_entity`.
- This prevents two same-term asks for different resolved entities from
  collapsing into one queue/cooldown lane.

Indexes:

- `[askedAt desc]`
- `[marketKey, askedAt]`
- `[collectableMarketKey, askedAt]`
- `[requestId, askedAt]`
- `[userId, askedAt]`
- `[reason, entityType, marketKey, askedAt]`

Update `OnDemandRequestUser`:

- `firstSeenAt`
- `lastSeenAt`
- `askCount`

Rename current `createdAt` semantics during migration rather than continuing to use it as hidden `lastSeenAt`.

Update `OnDemandRequestUsersCleanupService` to prune by `lastSeenAt`, not the old `createdAt` field.

Default retention:

- `collection_on_demand_ask_events`: `180 days`
- `collection_on_demand_request_users`: keep current windowed-state cleanup, but base it on `lastSeenAt`

### Runtime

`recordRequests(...)` should:

1. sanitize/dedupe/cap request list
2. upsert or find `collection_on_demand_requests` state rows by collectable
   market and entity identity lane
3. insert one `collection_on_demand_ask_events` row per sanitized ask before cooldown filtering
4. update `OnDemandRequestUser.firstSeenAt`, `lastSeenAt`, `askCount`
5. update `OnDemandRequest.distinctUserCount` and `lastSeenAt`
6. apply queue cooldown only to decide which requests are returned/enqueued

This makes repeat asks visible to demand and hot-spike logic even when queue churn is suppressed.

## Phase 3: Daily Demand Aggregate

### Schema

Add `user_search_demand_daily`.

Recommended columns:

- `demand_daily_id uuid primary key`
- `demand_date date`
- `user_id uuid null`
- `market_key varchar(255) null`
- `collectable_market_key varchar(255) null`
- `subject_kind demand_subject_kind`
  - `entity`
  - `query`
  - `term`
- `subject_key varchar(500)`
- `entity_id uuid null`
- `entity_type entity_type null`
- `normalized_text varchar(500) null`
- `source_kind demand_source_kind`
  - `search_log`
  - `on_demand`
  - `restaurant_view`
  - `food_view`
  - `favorite`
- `signal_kind demand_signal_kind`
  - `backend`
  - `cache`
  - `autocomplete_selection`
  - `recent_submit`
  - `low_result`
  - `unresolved_query`
  - `restaurant_view`
  - `food_view`
  - `favorite`
- `reason varchar(64) null`
- `signal_count int default 0`
- `first_seen_at timestamptz`
- `last_seen_at timestamptz`
- `metadata jsonb default '{}'`
- `created_at timestamptz`
- `updated_at timestamptz`

Use a raw SQL database unique index with `NULLS NOT DISTINCT` for nullable
scope and identity fields. The identity must include `entity_id` and
`entity_type`; on-demand term facts can legitimately contain the same term,
same user, same day, same scope, and same reason across different entity lanes.

```sql
CREATE UNIQUE INDEX uq_search_demand_daily_scope
ON user_search_demand_daily (
  demand_date,
  user_id,
  market_key,
  collectable_market_key,
  subject_kind,
  subject_key,
  entity_id,
  entity_type,
  source_kind,
  signal_kind,
  reason
) NULLS NOT DISTINCT;
```

Prisma may need this index in raw migration SQL rather than as a model-level `@@unique`.

### Aggregation Service

Add `SearchDemandAggregationService`.

Responsibilities:

- upsert daily rows inline for fresh facts where cheap
- rebuild any date range from durable raw tables
- expose shared query helpers for consumers
- never be the only raw source of truth
- use a transaction-scoped advisory lock for cron refreshes, not a session
  advisory lock split across Prisma pooled connections
- bucket daily rows consistently with the database column type:
  `user_search_logs.logged_at` is timestamp-without-time-zone storing UTC values,
  so use `logged_at::date`; timestamptz fact tables should use
  `AT TIME ZONE 'UTC'`
- fresh same-day search-log overlays must also compare `logged_at` to formatted
  UTC date keys, not JS `Date` parameters
- fresh same-day autocomplete popularity overlays must preserve cache weighting:
  community/global popularity downweights cache rows; personal affinity may treat
  cache as full personal recency.

Initial rebuild sources:

- `user_search_logs.eventKind = backend`
- `user_search_logs.eventKind = cache`
- `user_search_logs.metadata.submissionSource = autocomplete` with selected entity metadata
- `collection_on_demand_ask_events`
- `user_entity_view_events`
- `user_favorite_events` for append-only `added` favorite facts

View and favorite facts are global-only in v1 unless the append-only fact itself
stores factual UI/search market scope. Do not fan a view/favorite into every
`core_entity_market_presence` row; that turns restaurant availability into fake
user intent.

Search-log demand has three explicit aggregate views:

- `market_key IS NULL + collectable_market_key`: collectable-scoped rows for
  collection consumers, collapsed by distinct search event across UI-market
  fanout.
- `market_key + collectable_market_key IS NULL`: UI-market rows collapsed by
  distinct search event, so poll/autocomplete/UI readers do not double-count
  collectable fanout.
- `market_key IS NULL + collectable_market_key IS NULL`: global rows collapsed
  by distinct search event.

Fresh same-day UI overlays must use the UI `market_key` only. They must not
match `collectable_market_key`, or a same-day locality search can leak into a
regional autocomplete/popularity score before the aggregate cron normalizes it.

On-demand ask facts use the same split: UI-market rows collapse collectable
fanout for poll/search demand, collectable rows remain one row per executable
collection target, and global rows collapse the same UI ask once.

### Shared Demand Formula

Consumers should use a shared per-user demand unit:

```text
weightedCountByUser =
  sum(signal_count * signalWeight * recencyWeight)

userDemandUnit =
  log2(1 + weightedCountByUser)

baseDemand =
  sum(userDemandUnit over users)
```

Default recency:

```text
recencyWeight(ageDays) =
  1                                    if ageDays <= currentCycleDays
  2 ^ (-(ageDays - currentCycleDays) / halfLifeDays) otherwise
```

Initial constants:

- `currentCycleDays = 7`
- `halfLifeDays = 14`

These constants must be stored in score traces so tuning can explain old decisions.

Default signal weights:

- backend search: `1.0`
- cache reveal: `0.35` for global/community demand, `1.0` for personal recents
- autocomplete selection: `1.5`
- low-result ask: severity curve below
- unresolved ask: `1.0`
- restaurant/food view: `0.6`
- favorite: `1.5`

### View Demand Facts

`user_restaurant_views` and `user_food_views` are mutable UX state tables. They
track recency and current view counts, but they are not valid daily demand
facts because historical counts can move to the latest `lastViewedAt`.

Use `user_entity_view_events` as the rebuildable raw source for view demand:

- one row per cooldown-qualified restaurant or food view
- `entity_id` / `entity_type` identify the viewed subject
- `context_restaurant_id` carries the restaurant market context for food views
- `event_count` supports backfilled state rows and remains `1` for new events
- daily demand aggregation reads this event table, not mutable view state
- v1 aggregates view facts to explicit global rows only; scoped view demand is
  deferred until `user_entity_view_events` carries factual market scope

Use `user_favorite_events` as the rebuildable raw source for favorite demand:

- `user_favorites` remains current UX state
- `user_favorite_events.eventKind = added` feeds demand
- v1 aggregates favorite facts to explicit global rows only; scoped favorite
  demand is deferred until favorite events carry factual market scope

## Phase 4: Poll Topic Planning

Replace raw-count `SearchDemandService` topic seeding and `createdAt ASC` publishing with a scored candidate run.

### Candidate Inputs

Poll candidates read from `user_search_demand_daily` using:

- app/UI `marketKey`
- entity subjects only
- backend search demand
- autocomplete selection demand
- cache demand at lower community weight

Poll demand must read the UI-market aggregate view, not collectable fanout rows.

### Poll Score

```text
pollCandidateScore =
  baseDemand
  * pollCooldownAvailability
  * pollResurgenceBoost
```

Initial cooldown:

```text
effectiveDays = daysSinceLastPollForSubject + resurgenceCreditDays
pollCooldownAvailability = 1 - exp(-(effectiveDays / 28)^2)
```

Initial resurgence:

```text
currentCycleScore = base demand in last 7 days
baselineScore = max(previous 7 day score, rolling 28 day average weekly score, 3)
surgeRatio = currentCycleScore / baselineScore
surgeUnits = max(0, log2(surgeRatio) - 1)
resurgenceCreditDays = 21 * (1 - exp(-0.35 * surgeUnits))
pollResurgenceBoost = 1 + 0.5 * (1 - exp(-0.7 * surgeUnits))
```

Behavior:

- immediate reruns stay heavily suppressed
- one-month-old topics with 4x to 8x fresh demand can compete again
- evergreen demand remains ranked, but sudden renewed demand can break cooldown sooner

### Runtime Changes

- Add `PollTopicPlanningService`.
- Planning creates a scoring run and traces selected plus near-miss candidates.
- Publishing should select from current scored candidates or recently scored ready topics ordered by rank, not old `createdAt`.
- Keep max polls per market as resource budget.
- Do not add diversity dedupe in v1.

## Phase 5: On-Demand Ranking

On-demand has two layers:

- raw ask/request state
- collection queue priority

Do not replace `collection_on_demand_requests` with daily demand. It remains actionable request state.

### Low-Result Severity

```text
coverage = min(restaurantCount / targetCount, 1)
lowResultSeverity = 0.25 + 0.75 * (1 - coverage)^1.2
```

Initial `targetCount`:

- use `SEARCH_ON_DEMAND_MIN_RESULTS`
- fallback to default page size

Examples with target `25`:

- `0 results`: `1.00`
- `5 results`: about `0.82`
- `10 results`: about `0.66`
- `18 results`: about `0.41`
- `23 results`: about `0.29`

Unresolved queries use severity `1.0`.

### Hot-Spike Trend Boost

```text
baseUnmetScore24h =
  sum over users log2(1 + unmetAsksByUserIn24h)

surgeRatio =
  baseUnmetScore24h / max(previous24hScore, rollingBaselineScore, 3)

surgeUnits =
  max(0, log2(surgeRatio) - 1)

trendBoost =
  1 + 1.5 * (1 - exp(-0.7 * surgeUnits))
```

Cap trend boost at `2.5`.

### No-Results Recovery

```text
effectiveDays = daysSinceNoResults + resurgenceCreditDays
attemptAvailability = 1 - exp(-(effectiveDays / 45)^2)
```

Without resurgence:

- `7 days`: about `0.02`
- `14 days`: about `0.09`
- `30 days`: about `0.36`
- `45 days`: about `0.63`
- `60 days`: about `0.83`

### Queue Priority

```text
onDemandPriority =
  baseDemand
  * reasonSeverity
  * attemptAvailability
  * trendBoost
```

Only collectable markets with linked `collection_communities` may enqueue work. Poll/search-only locality markets may accumulate demand but must not enqueue collection.

Raw on-demand ask events must preserve both scopes:

- `marketKey`: the UI/search market where the ask happened. For active search
  and poll creation, this should be the locally resolved display market. If a
  known regional market already covers the request, keep the regional market and
  do not call TomTom. If no market covers the request, or the viewport has a
  qualifying uncovered component, TomTom may bootstrap a locality and the next
  local coverage pass decides the display market.
- `collectableMarketKey`: the specific linked collectable market that can execute collection, nullable when no linked collectable target exists.

If one ask fans out to multiple collectable targets, each collectable target gets
its own ask fact. Queue cooldown can suppress duplicate queue work, but it must
not suppress these raw ask facts.

## Phase 6: Keyword Collection Priority

### Ownership Rename

Promote keyword collection priority as the owner.

Delete or rename:

- `EntityPriorityMetricsRefreshService`
- `EntityPriorityMetricsRepository`
- Prisma `EntityPriorityMetric`
- table `collection_entity_priority_metrics`
- merge logic that treats that table as durable demand truth
- stale comments mentioning `EntityPrioritySelectionService`

Do not build new ranking logic on `collection_entity_priority_metrics`.

### Candidate Buckets

Keep the four current conceptual buckets because they answer different collection jobs:

- `unmet`
- `refresh`
- `demand`
- `explore`

Do not force raw scores across buckets into one pretend-universal meaning.

### Soft Reservations

Initial reservations preserve current intent:

- unmet: `5`
- refresh: `10`
- demand: `8`
- explore: `2`
- max terms: `25`

Algorithm:

1. Rank candidates inside each bucket.
2. Convert each bucket to bucket-local `rankQuality`.
3. Apply a bucket-local relative floor.
4. Stop a bucket at a natural cliff when the next candidate falls sharply relative to the bucket distribution.
5. Fill reservations only with qualifying candidates.
6. Put unused reserved slots into overflow.
7. Fill overflow from the strongest leftover candidates using bucket-local `rankQuality * bucketWeight`.

Initial bucket weights:

- unmet: `1.20`
- refresh: `1.10`
- demand: `1.00`
- explore: `0.65`

Bucket-local floor:

```text
robustZ = (score - medianScore) / max(1.4826 * MAD, epsilon)
eligible =
  score > 0
  AND (
    rank <= 1
    OR robustZ >= -0.75
  )
```

Natural cliff:

```text
dropRatio = nextScore / currentScore
stopAfterCurrent if rank >= 2 AND dropRatio < 0.55
```

Trace every selected keyword, every overflow winner, top rejected near misses, and every meaningful gate reject.

Keyword collection may use collectable-scoped search and autocomplete demand in
v1 by reading rows where `market_key IS NULL` and `collectable_market_key` is
the executable collection market. View and favorite facts remain global-only
until those append-only fact tables carry factual market scope, so keyword
collection must not read them as collectable-scoped signals.

## Phase 7: Autocomplete And Query Suggestions

Autocomplete should not wait for all demand work to be perfect, but it must not enable noisy attributes before gates exist.

### Request Scope

Backend DTO and mobile requests both carry `bounds` and `userLocation` for
request-time market scoping. Keep autocomplete request scope read-only; it must
not bootstrap missing locality markets.

Cache key must include:

- normalized query
- entity types
- user id presence/user id where personal data is included
- market scope key or `global`
- attribute lane enabled flag

### Entity Lane

Entity lane should rank by lexical fit first, then quality/demand boosts.

Do not let popularity outrank bad text matches.

Initial shape:

```text
entityRank =
  lexicalFit
  * (
      1
      + qualityBoost
      + personalAffinityBoost
      + localDemandBoost
    )
```

Profiles:

- restaurant/food prefix: first character allowed, prefix match can qualify; longer prefixes must be eligible directly, not only through FTS/trigram rescue.
- restaurant/food fuzzy: only after enough characters, with typo fixtures.
- attributes: first character allowed only with very strong support; exact/strong prefix allowed; fuzzy allowed only after enough characters and high confidence; no phonetic rescue.

When a user submits an entity autocomplete suggestion, the selected entity id is
authoritative for search execution. Do not rely on the LLM to rediscover the
selected restaurant, food, or attribute from the display text, and do not let
LLM unresolved side effects queue on-demand work for the already-selected entity.
Selected entity submissions should bypass generic-only/LLM routing entirely.
Coverage-driven low-result demand for the selected food or attribute, including
restaurant attributes like patio, remains
valid because it reflects a real under-served entity, not an interpretation
artifact.

### Query Suggestion Lanes

Personal query lane:

- matching prefix required
- backend and cache rows allowed
- rank by latest user submit, with repeats as a secondary signal
- purpose: "what matching thing did this user search most recently?"

Global query lane:

- matching prefix required
- backend rows only by default
- distinct-user dominant
- recency-windowed
- market scoped with global fallback for sparse markets
- sparse-market fallback is based on eligible scoped rows, not raw scoped row count
- purpose: "what matching phrase has broad community support?"

Personal and global query rows must be fetched independently before autocomplete
applies the merge policy. Do not let personal recents fill the query suggestion
budget and return before global/community suggestions are loaded.

### Attribute Lane

Attributes are a first-class autocomplete lane, gated by strict lexical and
support evidence rather than exception word lists. The lane reads typed demand
and selection validation from `user_search_demand_daily`, with corpus breadth as
a small cold-start/backstop signal.

Current rank shape:

```text
attributeRank =
  lexicalFit
  * (
      0.60 * typedSearchSupport
    + 0.30 * autocompleteSelectionSupport
    + 0.10 * corpusUsefulness
    )
```

Autocomplete selections are high-quality validation but biased by what we already showed, so they boost typed search support rather than replace it.

Corpus usefulness must include selectivity. Broad noisy attributes that attach to
nearly every restaurant should not win just because extraction mentioned them a
lot.

### Merge

Use lightweight soft reservations:

- entities: up to `3`
- personal queries: up to `2`
- global query: up to `1`
- attributes: up to `1` only when strong
- overflow: strongest remaining eligible candidates

No score traces for autocomplete requests.

## Phase 8: Recents And Server History

Server history reads `user_search_logs`:

- personal recents include `backend` and `cache`
- dedupe by normalized query text
- order by latest row
- cache repeats can move a query back to the top

Global/community demand readers:

- backend rows are primary
- cache rows are either excluded or down-weighted by signal policy
- no consumer should accidentally treat cache repeats as backend load

## Phase 9: Metrics

Keep:

- `search_requests_total` = backend search execution load
- `search_errors_total` = backend search execution errors
- existing execution histograms = backend execution behavior

Add if useful:

- `search_cache_attribution_total{result}`

Do not make cache reveal writes increment backend search metrics.

## Phase 10: Score Trace Tables

Add `demand_scoring_runs`.

Fields:

- `run_id uuid primary key`
- `consumer_kind`
  - `poll_topic`
  - `on_demand`
  - `keyword_collection`
- `market_key null`
- `collectable_market_key null`
- `cycle_start_at`
- `cycle_end_at`
- `scorer_version`
- `trace_all_candidates boolean`
- `started_at`
- `finished_at null`
- `metadata jsonb`

Add `demand_scoring_candidates`.

Fields:

- `candidate_id uuid primary key`
- `run_id uuid`
- `consumer_kind`
- `candidate_kind`
- `subject_kind`
- `subject_key`
- `entity_id null`
- `entity_type null`
- `normalized_text null`
- `bucket null`
- `lane null`
- `reason null`
- `final_score double precision`
- `rank int null`
- `selected boolean`
- `decision_state`
  - `selected`
  - `near_miss`
  - `gate_reject`
  - `budget_reject`
  - `dedupe_reject`
- `decision_reason`
- `factor_breakdown jsonb`
- `created_at`

Uniqueness:

```text
run_id + consumer_kind + candidate_kind + subject_kind + subject_key
+ entity_id + entity_type + market_key + collectable_market_key
+ bucket/lane + reason
```

Use a surrogate `candidate_id` as the primary identity because the same subject can appear in multiple lanes or reasons.

Retention:

- selected and near-miss candidates: `180 days`
- debug/all-candidate traces: `14 days`
- selected score summaries may be kept longer if volume is small

## Phase 11: Entity Merge And Rebuilds

Restaurant dedupe currently rehomes search logs, views, favorites, on-demand refs, and old priority metrics. The v1 guarantee should be:

- restaurant dedupe rehomes `user_search_demand_daily` rows for restaurant entities
- restaurant dedupe rehomes `collection_on_demand_ask_events` and
  `collection_on_demand_requests` entity refs, including
  `entity_identity_key`, and merges duplicate queue/request-user lanes
- restaurant dedupe rehomes append-only `user_entity_view_events` and
  `user_favorite_events`
- v1 directly rehomes raw facts and derived daily rows inside the merge
  transaction; the explicit `search-demand:rebuild` command is the operational
  repair/backfill path for affected date ranges when needed
- the restaurant merge rehome path is the only allowed direct
  `user_search_demand_daily` writer outside `SearchDemandAggregationService`

Generic food/attribute merge support is out of scope unless the implementation adds an equivalent rehome path.

## Implementation Order

1. Add delete gate.
2. Add `eventKind`, migrate search-log writers/readers, remove `SearchLogSource`.
3. Add cache attribution endpoint and mobile cache reveal logging.
4. Add on-demand ask events and fix cooldown ordering.
5. Add `user_search_demand_daily` schema and aggregation service.
6. Backfill/rebuild daily demand from existing raw tables.
7. Add score trace schema and writer helpers.
8. Cut poll topic planning to daily demand and traces.
9. Cut on-demand priority and hot-spike to ask events/daily demand.
10. Cut keyword collection to demand aggregate, soft reservations, traces, and delete old `EntityPriority*`.
11. Cut autocomplete scope/merge/query suggestions; promote attribute lane only with strict text/support gates and selected-entity execution.
12. Cut server recents to `eventKind`.
13. Add maintenance/rebuild jobs and retention cleanup.
14. Run delete gate and typechecks.

## Validation

Required:

- `yarn workspace api type-check`
- `npx tsc -p apps/mobile/tsconfig.json --noEmit`
- `bash scripts/search-demand-cutover-delete-gate.sh`
- Prisma validate/generate after migrations

Static checks:

- no `/search/events/click`
- no `SearchResultClickDto`
- no `SearchLogSource.poll`
- no raw demand `COUNT(*)` over `user_search_logs` outside aggregation service
- no direct `collection_entity_priority_metrics` owner after keyword cutover
- cache attribution endpoint clones backend rows server-side
- on-demand ask events insert before cooldown
- autocomplete cache key includes scope once scoped ranking is enabled
- search log uniqueness allows the same request/entity in multiple markets

Manual scenarios:

- backend search writes `eventKind=backend` and increments Prometheus search counter
- cache reveal writes `eventKind=cache`, moves server recents up, and does not increment backend search counter
- multi-market backend/cache attribution keeps one row per attributed market instead of dropping duplicates
- no-entity unresolved search creates on-demand ask event even inside cooldown
- low-result repeated ask updates demand facts while avoiding queue churn
- poll planning ranks fresh demand, respects cooldown, and writes selected/near-miss traces
- keyword cycle fills soft reservations, underfills weak buckets, and backfills from strong leftovers
- autocomplete first-letter suggestions show lane-merged results without noisy attributes

## Explicit Non-Goals

- No general query-event table in v1.
- No durable per-keystroke autocomplete traces.
- No diversity rule for poll topics in v1.
- No exception or deny lists for attribute quality control.
- No Prometheus product-demand metric.
