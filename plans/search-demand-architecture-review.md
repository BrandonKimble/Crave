# Search Demand Architecture Review

## Purpose

This document is the source-of-truth review and decision log for the search demand architecture. Treat `plans/search-demand-layer-architecture-pass.md` as raw notes only. Decisions in this file are inventory-backed and are carried into `plans/search-demand-layer-cutover-plan.md`.

The goal is to make search-related demand semantics cohesive across:

- attributed search history;
- cache-backed search repeats;
- local and server recents;
- global query suggestions;
- autocomplete entity and attribute ranking;
- poll topic planning;
- on-demand collection;
- keyword collection priority;
- metrics and score traces.

## Review Values

- Prefer simple systems, but not simplistic systems.
- Do not use non-exhaustive exception or deny lists for core ranking eligibility.
- Prefer natural log, decay, cooldown, recovery, and resurgence curves where behavior needs to scale.
- Separate raw facts, derived demand, scoring decisions, and operational metrics.
- Keep product demand separate from backend load.
- Keep request-time UX lightweight; reserve durable traces for batch-ranked decisions.
- Delete or rename misleading legacy concepts when a new owner is promoted.

## Initial Inventory (Pre-Cutover)

This inventory was captured before the cutover. Use it as evidence for why the
target shape exists, not as a claim that every listed legacy artifact still
exists in live code.

### Durable Source Tables

- `user_search_logs`

  - Current durable per-entity attribution table.
  - One backend search can create multiple rows, one per attributed entity/market.
  - Requires `entity_id`; it is not a query-level event table.
  - Uses `search_request_id` to group rows from one search.
  - Current source enum is broad: `SearchLogSource.search | poll`.

- `collection_on_demand_requests`

  - Durable request/queue state for unresolved or low-result collection demand.
  - Unique by term, entity type, reason, and market.
  - Owns queue/request lifecycle state and latest result counts.

- `collection_on_demand_request_users`

  - Current distinct-user join table for on-demand requests.
  - One row per request/user.
  - Target cleanup makes this explicit with `firstSeenAt`, `lastSeenAt`, and
    `askCount`.
  - Append-only ask history lives in `collection_on_demand_ask_events`; request
    user rows remain queue/deduped state.

- `user_restaurant_views`

  - Durable per-user restaurant view state.
  - Feeds autocomplete affinity and keyword collection signals today.

- `user_food_views`

  - Durable per-user food view state.
  - Should be treated as an engagement source for derived demand where relevant.

- `user_favorites`

  - Durable per-user favorite state.
  - Stronger preference signal than a one-off view or typed search.

- `user_favorite_events`

  - Append-only favorite facts used by demand rebuilds.
  - `user_favorites` stays current UX state; demand reads `added` events so
    history does not disappear when the user later removes a favorite.
  - Favorite demand is global-only in v1 because the event does not yet carry a
    factual UI/search market scope.

- `collection_entity_priority_metrics`
  - Current refreshed summary table with query, view, favorite, and autocomplete counters.
  - Not the true long-term owner for keyword selection.
  - Should be renamed/deleted during the keyword priority cutover rather than preserved as the conceptual owner.

### Current Readers And Consumers

- Search history / server recents

  - Reads `user_search_logs`, dedupes by normalized query text, and uses latest rows.
  - Cache-backed repeats are currently local-first and not durable server history.

- Query suggestions

  - Reads `user_search_logs.query_text`.
  - Current personal suggestions are prefix-matched and ordered by recency.
  - Current global suggestions are prefix-matched and ordered by request/log count.
  - Current global path is not distinct-user dominant, not market scoped, and not recency-windowed.

- Autocomplete entity popularity

  - Reads `user_search_logs` for global popularity and user affinity.
  - Also injects favorites and recently viewed restaurants.
  - Current final merge is one global score and top-N truncation.

- Poll topic planning

  - Uses `SearchDemandService`.
  - Current service uses raw `COUNT(*)` over `user_search_logs`.
  - Current scheduler uses blunt impression thresholds and cooldowns.

- On-demand collection

  - Writes unresolved and low-result request state to `collection_on_demand_requests`.
  - Current 5-minute cooldown suppresses repeated queue writes and also suppresses repeated demand facts.

- Keyword collection priority

  - Real current decision owner is `KeywordSliceSelectionService`.
  - Uses hard quotas for `unmet`, `refresh`, `demand`, and `explore`.
  - Uses capped normalized scores, so extra demand stops mattering after caps.
  - Uses on-demand request state, search logs, views, favorites, autocomplete selections, and attempt history.

- Prometheus metrics

  - `search_requests_total` records backend search processing load.
  - It is not a database table and should not be treated as product demand.

- Stale click endpoint
  - `/search/events/click` was a debug-only no-op and has been removed.
  - Autocomplete selection demand should come from submitted-search metadata, not a separate click endpoint.

- Legacy non-search search-log rows
  - The migration deletes old `user_search_logs.source <> 'search'` rows before
    dropping the legacy `source` column.
  - This is accepted for v1 because the app has not been deployed and those rows
    are not part of the new backend/cache attribution contract.

## Locked Decisions

### Red-Team Corrections Before Cutover

- `user_search_demand_daily` must be rebuildable from durable raw facts. If no-entity/on-demand asks write into daily demand, they must first have a durable source fact such as explicit on-demand user `firstSeenAt`/`lastSeenAt`/`askCount` fields or a narrow append-only unresolved-demand table. Do not use unrebuildable direct aggregate increments as the only source of truth.
- Cache attribution must be server-owned. The cache write endpoint should clone the original backend attribution rows by original backend `searchRequestId`, or use a signed/server-owned attribution snapshot. It must not accept arbitrary client-supplied attributed entities as truth.
- On-demand cooldown must suppress queue churn only. Repeat asks must update raw ask facts before cooldown logic decides whether to touch or enqueue collection work.
- Poll planning needs lifecycle ownership, not only new score inputs. Candidate scoring should happen at selection/publish time, with selected and near-miss trace rows, so stale created-order topics do not publish just because they were seeded earlier.
- Autocomplete local/community behavior requires market or bounds scope in the request and cache key before market-scoped ranking is enabled. Attributes stay disabled from the main lane until support gates and shared text-match profiles are implemented.
- Score trace uniqueness must include the scoring consumer, candidate kind, subject identity, lane or bucket, and reason, or use a surrogate candidate id. A subject can validly appear in multiple lanes/reasons in the same run.
- Score trace de-dupe must also include `entityId` and `entityType`, because the same term/subject key can be valid in multiple resolved entity lanes.
- The `EntityPriority*` cleanup has live owners today. The cutover must remove or rename the refresh service, repository, model/table ownership, and merge references, or explicitly mark any remaining artifact as a non-authoritative keyword signal.
- Entity-merge rebuild guarantees are currently grounded for restaurant dedupe only. Generic food/attribute demand rehome should either be implemented in the cutover or left explicitly out of scope.

### Market Contract Dependency

- Implement the TomTom market cutover before the search-demand cutover.
- `core_markets` is the canonical runtime market contract for demand.
- Demand consumers must not know whether a locality market was bootstrapped from TomTom or another future source.
- Keep dual market scope first-class:
  - `marketKey`: app/UI market where demand happened; used by history, local analytics, autocomplete local scope, and poll topic planning.
  - `collectableMarketKey`: collectable market where Reddit/keyword collection can execute; used by on-demand and keyword collection.
- Poll-only/local UI demand must remain valuable even when no collectable community exists yet.
- Collection work must remain gated by stored collectable markets and linked `collection_communities`, not by raw TomTom responses.
- Active search submit and poll creation may bootstrap missing locality markets
  only when local coverage does not already resolve the request, or when a
  viewport has a qualifying uncovered component. Region-covered searches should
  resolve locally without a TomTom call. Request-time autocomplete, restaurant
  enrichment, and passive read/enrichment flows must not bootstrap markets.
- Market resolution modes are explicit:
  - `polls_read`: passive poll/feed lookup, no locality bootstrap.
  - `polls_create`: active poll creation, locality bootstrap allowed.
  - `search`: active search/submission path, locality bootstrap allowed only
    when the caller explicitly asks for it.

### Search History And Cache Rows

- `user_search_logs` remains the only v1 durable attributed search-history table.
- Do not add a v1 query-level `search_events` table.
- No-entity searches should go through:
  - entity text rescue;
  - then on-demand unresolved handling if no entity can be attributed.
- Cache reveal rows may be written to `user_search_logs`, but only when the cached response has attributed entities.
- Cache reveal rows must use a fresh `searchRequestId`.
- Cache reveal rows should store the original backend request id in metadata.
- Cache reveal rows should be written by a narrow server endpoint that records attribution rows without rerunning search.
- The cache endpoint should clone server-owned attribution from the original backend request id or a signed/server-owned attribution snapshot, not from arbitrary client-supplied entity ids.
- Backend search rows and cache reveal rows must be distinguishable by a new `eventKind` column with v1 values `backend` and `cache`.

### Daily Demand Layer

- `user_search_demand_daily` is v1 core, not merely a future optimization.
- It is a mostly rebuildable derived aggregate, not raw event storage.
- It must not accept direct daily increments for no-entity/on-demand asks unless those increments are backed by a durable raw source fact that can rebuild the aggregate.
- It is cross-source and should aggregate:
  - attributed search rows;
  - cache reveal rows;
  - on-demand asks;
  - restaurant views;
  - food views;
  - favorite events;
  - autocomplete selections derived from submitted searches.
- It must split provenance from meaning:
  - `sourceKind`: where the fact came from, such as `search_log`, `on_demand`, `restaurant_view`, `food_view`, `favorite`;
  - `signalKind`: how consumers interpret it, such as `backend`, `cache`, `autocomplete_selection`, `recent_submit`, `low_result`, `unresolved_query`, `restaurant_view`, `favorite`.
- Consumers must opt into signal kinds explicitly rather than relying on broad raw counts.
- View/favorite sources are explicit global rows only in v1. Scoped poll or
  keyword demand must not infer user intent from `core_entity_market_presence`.
- Personal query suggestions and entity affinity may overlay fresh same-day raw
  search-log rows so request-time UX does not wait for the aggregate cron. These
  overlays own today's demand and should be added to aggregate reads that exclude
  today, otherwise a cron refresh can double-count same-day events. Because
  `user_search_logs.logged_at` is timestamp-without-time-zone, fresh overlays
  also use formatted UTC date keys such as `logged_at >= ${todayKey}::date`,
  not JS `Date` parameters.
- Search-log aggregates expose separate UI-market, collectable, and global
  views. UI-market readers consume rows where `market_key` is set and
  `collectable_market_key IS NULL`; collection readers consume rows where
  `market_key IS NULL` and `collectable_market_key` is set; global readers
  consume both scope fields as null. This prevents one fanned-out search event
  from becoming multiple UI or collection demand signals.
- Fresh same-day UI overlays use `market_key` only. They do not match
  `collectable_market_key`, because collectable scope is a collection execution
  target, not a UI autocomplete/popularity market.
- Search-log date buckets use `logged_at::date` because `user_search_logs`
  stores UTC timestamps without time zone. `AT TIME ZONE 'UTC'` is reserved for
  timestamptz fact tables such as on-demand asks, view events, and favorite
  events.

### On-Demand Demand Semantics

- `collection_on_demand_requests` remains the request/queue state table.
- `user_search_demand_daily` does not replace `collection_on_demand_requests`.
- On-demand cooldown should suppress queue churn, not raw demand facts.
- Queue state uniqueness includes an `entityIdentityKey` so same-term asks for
  different resolved entities do not collapse into one cooldown lane.
- Restaurant merge must rekey `collection_on_demand_requests.entityIdentityKey`
  and merge duplicate request-user lanes, not only update `entityId`.
- Repeated asks should feed daily demand before queue cooldown blocks expensive work.
- Repeated asks should update explicit raw ask fields before queue cooldown blocks expensive work.
- Rich repeat-intensity math should come from the daily demand aggregate, not from the one-row-per-user join table.

### Selection And Click Semantics

- Keep `/search/events/click` deleted.
- Do not introduce a separate autocomplete-selection event in v1.
- Autocomplete selection remains metadata on the submitted search.
- Daily demand derives `autocomplete_selection` from submitted search rows where metadata identifies a selected entity.

### Batch Scoring And Traces

- Score traces are v1 batch-only:
  - poll topic planning;
  - on-demand collection ranking;
  - keyword collection priority.
- Do not trace request-time autocomplete ranking or personal recents in v1.
- Trace tables must include queryable columns for candidate identity and decision state, not JSON-only identity.
- Trace identity must distinguish the same subject appearing in multiple consumers, lanes, buckets, or reasons.
- Candidate score traces should include:
  - `candidateKind`;
  - `bucket` or lane where applicable;
  - `reason` where applicable;
  - `decisionReason`;
  - `finalScore`;
  - `rank`;
  - `selected`;
  - `factorBreakdown` JSON.
- Retention default:
  - all selected candidates;
  - top rejected or near-miss candidates;
  - meaningful gate rejects such as cooldown, insufficient support, no-results recovery, dedupe, or resource-budget cutoff.
- Add a tuning flag to trace all candidates while volume is small or while tuning a scorer.

### Shared Scoring Direction

- Polls, on-demand collection, and keyword collection should cut over to a shared scoring vocabulary in v1.
- Shared concepts:
  - per-user log-scaled demand;
  - distinct-user breadth as the main community signal;
  - repeated asks as meaningful but diminishing power-user intensity;
  - current-cycle full-weight recency;
  - smooth decay after the current cycle;
  - cooldown/recovery curves;
  - resurgence or trend boost only where it reflects renewed urgency.
- Avoid hard caps that make demand stop mattering.
- Avoid hard thresholds except where they represent resource limits or true eligibility gates.

### Keyword Priority Ownership

- Keyword collection priority is the correct concept, not entity priority.
- New code should not introduce new `EntityPriority*` owners.
- Rename/delete old `EntityPriority*` names during the implementation cutover.
- Do not keep `collection_entity_priority_metrics` as a conceptual owner if `user_search_demand_daily`, score traces, and attempt/yield events cover the need.

### Autocomplete And Query Suggestions

- Autocomplete should use lane-local ranking plus soft reservations, not one global score.
- Suggestions should be eligible from the first typed character.
- Lanes:
  - entity;
  - personal query;
  - global query;
  - attribute.
- Initial soft slot target:
  - entities: up to 3;
  - personal queries: up to 2;
  - global query: up to 1;
  - attributes: up to 1 when strong;
  - overflow: strongest remaining eligible candidates.
- Global query suggestions stay request-time in v1.
- Global query suggestions should become distinct-user dominant and use a recency window.
- Personal query suggestions can use backend and cache rows once cache rows are protected by `eventKind`.
- Global query suggestions should use backend rows first; cache rows should not inflate global demand by default.
- Personal and global query suggestions are generated as independent request-time
  lanes before autocomplete applies soft reservations. Personal recents must not
  be able to consume the whole query budget before a strong global suggestion is
  loaded.
- Attributes require stricter lexical gates and positive support.
- No non-exhaustive deny lists for noisy attributes.

### Metrics

- Prometheus backend counters remain backend load metrics.
- Cache reveals should not increment backend search load metrics.
- Product demand should come from `user_search_demand_daily`, not from Prometheus counters.

## Rejected Or Deferred Ideas

- Rejected for v1: query-level `search_events` table.
- Rejected for v1: separate autocomplete-selection event table.
- Rejected for v1: durable traces for every autocomplete keystroke.
- Rejected: keeping `/search/events/click` as a misleading no-op.
- Deferred: materialized global query suggestion scorer with traces.
- Completed: final implementation cutover plan is `plans/search-demand-layer-cutover-plan.md`.

## Resolved Into Cutover Plan

The implementation-specific questions from the review are resolved in
`plans/search-demand-layer-cutover-plan.md`. The key resolutions are:

- cache attribution clones server-owned backend rows;
- no-entity/on-demand repeat asks get `collection_on_demand_ask_events`;
- `user_search_demand_daily` is backed by durable source facts;
- poll, on-demand, and keyword batch decisions use score traces;
- `SearchLogSource` is replaced by `eventKind`;
- `collection_entity_priority_metrics` is deleted or renamed out of conceptual ownership;
- attribute autocomplete is promoted only through strict text/support gates and selected-entity execution.

## Review Order

1. Raw search event/history semantics.
2. Daily demand aggregate.
3. Poll topic planning.
4. On-demand collection.
5. Keyword collection priority.
6. Autocomplete/query suggestions.
7. Recents/server history.
8. Metrics and Prometheus.
9. Trace schema and retention.
10. Maintenance and delete gates.

For each section:

1. Inspect current implementation and stale plan notes.
2. Record current behavior, intended behavior, risks, and stale ideas.
3. Ask focused product/architecture questions only where code cannot decide.
4. Mark outcomes as `locked`, `open`, `deferred`, or `rejected`.

## Implementation Plan

Use `plans/search-demand-layer-cutover-plan.md` for the implementation sequence.
