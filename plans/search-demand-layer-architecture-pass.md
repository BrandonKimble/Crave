# Search Demand Layer Architecture Pass

> Superseded working notes. Treat `plans/search-demand-architecture-review.md`
> as the current decision log. This file is useful for context and discarded
> alternatives, but it is not implementation authority.
> In particular, any `SearchLogSource` or `collection_entity_priority_metrics`
> references below are stale/rejected unless the current cutover plan explicitly
> says otherwise.

## Summary

Search activity currently flows through `user_search_logs`, but the table is being asked to serve several different jobs:

- personal recents and autocomplete history;
- global query suggestions;
- autocomplete entity popularity;
- poll topic planning;
- keyword/on-demand collection priority;
- search demand analytics.

Those jobs do not all mean the same thing by "demand." Some should care about the user's most recent action, some should care about distinct community interest, and some should respect repeated power-user intent. The ideal shape is to keep raw events factual and move interpretation into a demand layer with explicit rules per consumer.

The practical target is:

```text
event facts -> normalized demand aggregates -> consumer-specific thresholds/policies
```

Not:

```text
each consumer queries raw logs and invents its own count meaning
```

## Current Evidence

### Search Logs

`SearchLog` is an entity-attribution log, not a complete search-event table.

- It stores one row per attributed entity, with `queryText`, `searchRequestId`, user, market, totals, and metadata.
- It only supports `SearchLogSource.search` and `SearchLogSource.poll` today.
- It is written from the backend search path after page 1 query impressions are recorded.

Source files:

- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/search/search.service.ts`

Important implication: a cache reveal, a client-only recent reorder, and a backend query are different events, but today only backend query attribution is represented.

### Poll Demand

Poll topic planning is the clearest outlier.

`SearchDemandService` uses raw row counts:

```sql
COUNT(*) AS impressions
```

The poll scheduler then uses:

- `POLL_CITY_DEMAND_WINDOW_DAYS`, default `14`;
- `POLL_CITY_MIN_IMPRESSIONS`, default `10`;
- `POLL_TREND_MIN_IMPRESSIONS`, default `50`;
- cooldown defaults of 60 days, or 30 days for high-trend topics.

This means 10 log rows can qualify a market/entity even if they came from a small number of users. That is not ideal for public/community poll planning.

Source files:

- `apps/api/src/modules/analytics/search-demand.service.ts`
- `apps/api/src/modules/polls/poll-scheduler.service.ts`

### Query Suggestions

Query suggestions already dedupe better than poll demand.

- Personal suggestions group by normalized query text.
- Global suggestions group by normalized query text.
- Counts use `COUNT(DISTINCT COALESCE(search_request_id, log_id))`, not raw rows.

This is acceptable for "how often was this query used," but it is still not the same as "how many users want this."

Source file:

- `apps/api/src/modules/search/search-query-suggestion.service.ts`

### Autocomplete Entity Popularity

Autocomplete entity popularity also uses distinct request/log identity, not raw rows:

```sql
COUNT(DISTINCT COALESCE(search_request_id, log_id))
```

That is reasonable for ranking autocomplete candidates, but it should eventually move to shared demand aggregates so it can share recency and distinct-user semantics with the rest of the product.

Source file:

- `apps/api/src/modules/search/search-popularity.service.ts`

### Keyword Collection Priority

The newer collection paths already point in the right direction.

The current `EntityPriorityMetricsRefreshService` refreshes 30-day aggregate counters and uses:

- `COUNT(DISTINCT user_id)` for query impressions;
- `COUNT(DISTINCT user_id)` for autocomplete selections;
- views and favorites as separate engagement signals.

The current `KeywordSliceSelectionService` also uses distinct users for query, autocomplete, view, favorites, and unmet/on-demand demand. These names should be replaced by keyword-collection-priority naming in the cutover.

Source files:

- `apps/api/src/modules/content-processing/reddit-collector/entity-priority-metrics-refresh.service.ts`
- `apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts`

### On-Demand Collection

On-demand collection already has a distinct-user table:

- `collection_on_demand_requests`
- `collection_on_demand_request_users`

`OnDemandRequestUser` is keyed by `(requestId, userId)`, so repeated requests by the same user update the row rather than inflate `distinctUserCount`.

This is good for community validation. It does not yet capture capped power-user intensity, but it is structurally safer than raw counts.

Source files:

- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/search/on-demand-request.service.ts`

## Design Principles

### 0. No Non-Exhaustive Exception Lists

Avoid non-exhaustive deny lists or ad hoc exception lists for ranking or eligibility.

If a system needs quality control, prefer positive eligibility signals, structured entity metadata, durable quality tiers, or measurable behavior. Do not rely on a hand-maintained list like "great", "amazing", or "nice" to decide core product behavior.

### 0.1. Shared Text Match Contract, Profiled Strictness

Text matching should use one shared contract, not many unrelated scoring meanings. The contract should expose the evidence that made a candidate eligible:

```text
exact_name
exact_alias
prefix_name
prefix_alias
fts_name
fts_alias
trigram_name
trigram_alias
phonetic_name
```

Consumers should then choose a strictness profile instead of each consumer inventing its own fuzzy behavior:

```text
entity_autocomplete:
  restaurant/food user-facing suggestions.
  Allows exact, prefix, full-text, trigram, and guarded typo evidence.
  Raw phonetic matches should not rank on their own in user-facing autocomplete.

attribute_autocomplete:
  food/restaurant attribute user-facing suggestions.
  Requires stronger lexical evidence and positive support signals.
  Does not allow broad fuzzy or phonetic matching until tuned explicitly.

query_suggestion:
  prior typed query suggestions.
  Prefix text match only.

search_resolution:
  natural-language search interpretation.
  Stricter than ingestion because bad matches change result semantics.

ingestion_resolution:
  backend entity cleanup and extraction.
  Can be looser because it is not directly shown as a user-facing suggestion.
  May use phonetic and broader fuzzy evidence with review/tuning safeguards.
```

The first implementation should keep Postgres as the matching engine. We already have prefix indexes, `pg_trgm`, full-text search, alias trigram search, and phonetic support. External search infrastructure should wait until Postgres cannot meet latency, typo-tolerance, highlighting, or ranking needs.

### 1. Events Are Facts

Raw events should say what happened, without pretending to know every downstream use.

Examples:

- `backend`: the API actually ran a page-1 search.
- `cache`: the app showed a cached result to the user.
- `restaurant_view`: user opened a restaurant profile.

Submit sources such as autocomplete, recent, manual, and shortcut should remain metadata on the search event unless we later need separate event types. We do not need to explode the schema immediately.

### 2. Demand Is Interpretation

Demand answers a product question:

- "Should we create a poll?"
- "Should we collect more Reddit evidence?"
- "Should this query appear globally?"
- "Should this query move up in one user's recents?"

Those are different questions. They should not all use the same raw count.

### 3. Distinct Users Are The Primary Community Signal

For global/community decisions, many people asking once should count more than one person asking many times.

This matters most for:

- public poll creation;
- global query suggestions;
- keyword collection priority.

### 4. Power Users Still Count

Repeated demand from one user should not be ignored. It should be capped or log-scaled.

Example:

```text
1 user searches "Persian breakfast" 10 times:
  useful signal, especially for collection/on-demand.

10 users search "Persian breakfast" once:
  stronger community signal.

10 users search it twice:
  strongest signal.
```

The repeated user should move personal UX immediately and can influence collection, but should not single-handedly create every public poll topic.

### 5. Cache Hits Are UX Events, Not Backend Demand

If a user reruns the same search from cache:

- local recents should update immediately;
- the result should reveal quickly;
- backend demand should not be inflated;
- public demand should not automatically increase unless we explicitly decide cache reveals are demand events.

## Proposed Event Layer

### Minimal Near-Term Shape

Add a single semantic event column to search logs:

```ts
eventKind:
  | 'backend'
  | 'cache'
```

Keep existing metadata for:

```ts
submissionSource:
  | 'manual'
  | 'recent'
  | 'autocomplete'
  | 'shortcut'
```

This keeps your preferred shape: no separate `demandEligible` column. Consumers derive eligibility from `eventKind`, source, timestamps, user, market, and entity data.

`SearchLogSource` can stay as the broader domain source (`search` or `poll`). `eventKind` should answer the narrower question: did this row come from a backend search execution, a cache-backed reveal, or another concrete interaction?

Near-term rules:

- `backend`: eligible for backend demand and product demand.
- `cache`: eligible for personal recents/history, not backend demand, not collection/poll demand by default.

### Cleaner Long-Term Shape

Eventually, split the current entity-attribution log into two concepts:

```text
search_events
  event_id
  user_id
  event_kind
  search_input_key
  query_text
  submission_source
  market_key
  bounds_bucket
  occurred_at

search_event_entity_attributions
  event_id
  entity_id
  entity_type
  attribution_role
  result_totals
```

That avoids the current ambiguity where `user_search_logs` is both "a search happened" and "this entity was attributed to that search."

I would not require this split before the next implementation pass. The practical first step is the `eventKind` column and shared demand query/service.

## Proposed Demand Layer

The demand layer should expose aggregate records, not raw logs.

Conceptually:

```ts
type DemandSubject =
  | { kind: 'entity'; entityId: string; entityType: EntityType }
  | { kind: 'query'; normalizedQuery: string };

type DemandScope =
  | { kind: 'global' }
  | { kind: 'market'; marketKey: string }
  | { kind: 'user'; userId: string };

type DemandAggregate = {
  subject: DemandSubject;
  scope: DemandScope;
  windowDays: number;
  distinctUsers: number;
  backendRequests: number;
  cappedRepeatIntensity: number;
  autocompleteDistinctUsers: number;
  cacheRevealUsers: number;
  lastSeenAt: Date | null;
  score: number;
};
```

### Score Shape

For community/product demand:

```text
score =
  distinctUsers
  + 0.25 * cappedRepeatIntensity
  + source boosts
  then recency decay
```

Where:

```text
cappedRepeatIntensity =
  sum per user of log1p(min(userEventsForSubject, cap))
```

This lets one power user matter without allowing one person to dominate global/community systems.

### Recency

Use explicit windows and decay instead of bare fixed counts.

Recommended defaults:

- 7 days: trend/spike detection.
- 30 days: normal collection/entity demand.
- 90 days: long-tail on-demand user retention.
- 5 minutes: client search result cache, purely UX/backend-load optimization.

For scores, prefer a half-life over a cliff:

```text
recencyWeight = 0.5 ^ (ageDays / halfLifeDays)
```

That means demand fades naturally instead of disappearing all at once.

## Consumer Policies

### Personal Recents

Purpose: make the UI reflect what the user just did.

Policy:

- update local recents immediately for backend searches and cache reveals;
- dedupe by normalized query;
- order by latest local submit;
- server history can lag or only record backend searches.

Cache hit example:

```text
User searches sushi, then tacos, then sushi again from cache.
UI recents should show sushi first.
Backend demand does not need another row.
```

### Server Search History

Purpose: restore user history across sessions/devices.

Recommended policy:

- include `backend`;
- include `cache` after `eventKind` is added and raw-log consumers are protected;
- if cache reveals are added, consumers must filter by `eventKind`.

Cache rows should make server history match local recents, but they should not silently become backend demand or community demand.

### Global Query Suggestions

Purpose: help users discover commonly repeated query text.

Current live shape:

- `SearchQuerySuggestionService` reads directly from `user_search_logs`;
- personal suggestions are grouped query text for the current user, ordered by latest search first;
- global suggestions are grouped query text for all users, ordered by request/log count first;
- both currently use `COUNT(DISTINCT COALESCE(search_request_id, log_id))`, not distinct users;
- autocomplete merges those query suggestions with entity matches and filters weak global suggestions with `AUTOCOMPLETE_QUERY_SUGGESTION_MIN_GLOBAL_COUNT`.

Recommended target:

- keep query suggestions as part of autocomplete, not as a separate competing search surface;
- split semantics into `personal` and `global` explicitly;
- personal suggestions should require the typed prefix to match, then stay recency-first within that prefix;
- personal suggestions should include `backend` and can include `cache` once cache events are written with explicit `eventKind`;
- global suggestions should use only `backend` events at first;
- global ranking should be distinct-user dominant, with per-user log-scaled repeat intensity as a small tiebreaker;
- use normalized query text as the subject, preserving latest display text for casing;
- use a recency window instead of all-time counts: start with 30 days, one current weekly cycle at full weight, then the same 14-day half-life shape used by poll demand;
- prefer market-scoped global suggestions first when a market is available, then fall back to all-market global suggestions;
- do not write score traces for every autocomplete keystroke. If global suggestions become a materialized batch job later, write one scoring run per refresh and store selected plus top rejected query candidates.

Candidate story:

```text
User types "su".

1. Find this user's prior queries that start with "su".
   Keep the most recent ones first. Repeat use only breaks ties.

2. Find community queries that start with "su".
   Give each user diminishing influence through the shared per-user log curve.
   Recent current-cycle demand stays full strength.
   Older demand decays after the current cycle.

3. Merge query suggestions with entity autocomplete candidates.
   Entity rows answer "which known object?"
   Query rows answer "which full search phrase?"
```

This keeps autocomplete responsive without letting one user spam a query into the global list.

### Autocomplete Merge Policy

Autocomplete should borrow the soft-reservation idea from keyword collection, but not the full batch-planning machinery. It runs on every typed prefix, so the merge must stay small, predictable, and request-time safe.

Locked target:

- each lane ranks itself first:
  - personal query lane: typed prefix match, then recency;
  - global query lane: typed prefix match, then distinct-user community strength;
  - entity lane: lexical fit first, then community and personal pull;
  - attribute lane: stricter lexical fit plus broad/repeated support;
- use small soft reservations, not hard quotas;
- weak candidates should not fill a reserved lane slot just because the lane has a target;
- unused reserved slots should overflow to the strongest remaining eligible candidates from other lanes;
- do not collapse all lanes into one giant global score, because the lanes answer different UX questions;
- do not write per-keystroke score traces.
- autocomplete should start producing eligible suggestions from the first typed character; strictness should come from lane quality gates, not from hiding the surface until two or three characters.

Locked initial slot shape:

```text
entities:          up to 3
personal queries:  up to 2
global queries:    up to 1
attributes:        up to 1, only when strong
overflow:          strongest remaining eligible candidates
```

Locked lane quality gates:

```text
entity lane:
  may qualify from one typed character when there is exact/prefix evidence.
  fuzzy/typo evidence should stay length-gated.

personal query lane:
  may qualify from one typed character.
  must prefix-match the typed text and belong to the current user.
  recency is the primary rank signal inside this lane.

global query lane:
  may qualify from one typed character.
  must prefix-match the typed text and have community support.
  distinct-user support dominates; repeated asks are log-scaled tiebreakers.

attribute lane:
  should remain stricter than entities.
  must have strong lexical evidence and positive support.
  should not fill its reserved slot with weak corpus-only noise.
```

This gives autocomplete the same values as keyword collection selection: preserve lane diversity, avoid forcing weak candidates, and let strong overflow candidates win unused space. The implementation should be much lighter than keyword collection because autocomplete is a live UI path, not a scheduled batch planner.

Open tuning details before implementation:

- exact attribute support threshold once the demand aggregate exists;
- exact dedupe priority when the same text appears as a query suggestion and an attribute/entity;
- exact overflow comparator for strong leftovers across lanes.

### Search Execution Text Rescue

Natural-language search should not fall back to arbitrary raw text results. User-facing search results should stay grounded in known entities and the structured restaurant/item graph.

Locked flow:

```text
LLM extracts query terms
-> exact/alias/entity resolution
-> shared EntityTextSearch rescue for unresolved terms
-> if rescued, execute by resolved entity IDs
-> if still unresolved, record on-demand/unmet demand
```

The rescue step should use the same shared text-match contract and strictness profiles as autocomplete, but it runs before query execution rather than after a failed broad result. This avoids a bad state where an unknown query gets generic restaurant results only because no entity filters were applied.

Policy:

- do not serve raw Reddit/document/text-search hits directly as polished search results;
- raw text/document search belongs in collection/on-demand discovery;
- unresolved terms should be preserved as demand facts even if nearby entity rescue finds partial matches;
- if no entity can be rescued, return unresolved/empty or partial coverage with on-demand metadata rather than pretending generic results matched the query.

### Autocomplete Entity Popularity

Purpose: rank candidate entities better.

Policy:

- use entity demand aggregate;
- global: mostly distinct users;
- user affinity: personal event count/recency can matter more;
- cache reveals should not change global popularity by default.

Recommended target:

- keep text match as the entry gate; a weak text match should not win only because an entity is popular;
- exact and prefix matches must receive strong lexical confidence; short-prefix matches should not enter final ranking with `confidence = 0`;
- route autocomplete, query suggestions, search expansion, natural search resolution, and ingestion resolution through the shared text-match contract where practical;
- keep strictness as a named profile, not as scattered threshold literals;
- main search autocomplete should pass market scope when available, prefer market-present restaurants, and use market-scoped community demand before falling back to global demand;
- main search autocomplete should include `food_attribute` and `restaurant_attribute` candidates, not only `food` and `restaurant`;
- attribute candidates need a stricter lexical gate than restaurants/foods because collected attributes can contain noisy generic terms like "great" or "amazing";
- attribute support should be user-intent-first: typed searches anchor the signal, autocomplete selections validate it, and corpus breadth is a small cold-start/backstop signal;
- rank matching entities with three layers:
  - lexical fit: how well the typed text matches the entity name or aliases;
  - community pull: how many distinct users have searched/selected this entity recently, with log-scaled repeats;
  - personal pull: this user's favorites, recent views, and prior searches/selections;
- attribute candidates should be lane-limited or downweighted until their quality gates are tuned, so generic/noisy attributes do not crowd out strong food/restaurant matches;
- `cache` events may help personal affinity/history, but should not increase community entity popularity by default.

Locked attribute rule:

```text
Restaurants/foods:
  allow prefix, full-text, and fuzzy matching using the normal lexical gate.

Food/restaurant attributes:
  require closer lexical evidence before entering autocomplete.
  Initial acceptable gates should be exact name, strong prefix, or strong alias match.
  Prefer attributes with broad/repeated user intent over one-off collected terms.
  Loose fuzzy/phonetic attribute matches should be excluded until we tune them explicitly.
```

Locked attribute support rule:

```text
Attribute searches:
  Primary signal. These are explicit user demand, so they should anchor support.
  Aggregate by distinct users with per-user log-scaled repeats.

Autocomplete selections:
  Strong validation signal. One selection can count more than one typed search
  because the user intentionally chose the attribute, but selections are biased
  by what autocomplete already showed, so they should boost rather than anchor.
  Aggregate by distinct users with per-user log-scaled repeats.

Corpus support:
  Small cold-start/backstop signal. Count distinct restaurants connected to the
  attribute and optional extracted mention strength, but do not let corpus breadth
  dominate because noisy terms can attach to many restaurants.

Initial weighting target:
  typedSearchSupport:            0.55-0.65
  autocompleteSelectionSupport:  0.25-0.35
  corpusSupport:                 0.05-0.15

Per-event intuition:
  1 typed attribute search ~= 1.0 intent unit
  1 autocomplete selection ~= 1.5 intent units before aggregation
```

Typed searches are demand; autocomplete selections are validation. Attribute
autocomplete should become more accurate as usage grows, while corpus support
keeps useful cold-start terms like "patio" discoverable without allowing broad
generic terms like "great" to dominate.

Delete gates for the text-match cutover:

- no user-facing attribute autocomplete path may use a loose fallback resolver or phonetic match unless the `attribute_autocomplete` profile explicitly allows it;
- no user-facing autocomplete candidate may rank with `confidence = 0` when its actual eligibility was exact or prefix text evidence;
- no ranking path should inspect hand-maintained noisy-term deny lists for core eligibility;
- no consumer should interpret a numeric text score without also knowing its evidence kind and strictness profile.

Fixture pass findings:

```text
su:
  Current short-prefix path finds prefix candidates but returns similarity/confidence as 0.
  Fix: exact and prefix evidence must produce real lexical confidence.

tac:
  Current long-term path can miss taco because three-character prefixes pass through FTS/trigram thresholds.
  Fix: prefix_name/prefix_alias should be eligibility evidence from the first typed character.

patio:
  Correct target is restaurant_attribute "outdoor seating" through exact_alias "patio".
  Fix: exact_alias evidence must be preserved and scored strongly.

suhsi:
  Raw phonetic fallback can produce "sauce" instead of "sushi".
  Fix: user-facing autocomplete should avoid raw phonetic-only matches.

brnch:
  Bounded typo matching can reasonably recover "brunch".
  Fix: if typo fallback is added, prefer length-aware edit-distance evidence over raw phonetic evidence.

great / best:
  Exact attribute entities exist, but current support is weak.
  Fix: attribute autocomplete should require positive support, not just exact lexical match.
```

Locked text-match profile tuning:

```text
entity_autocomplete:
  exact_name/exact_alias: lexicalScore = 1.00
  prefix_name: lexicalScore = 0.72 for 1 char, 0.80 for 2 chars, 0.88 for 3 chars, 0.92 for 4+ chars
  prefix_alias: lexicalScore = prefix_name - 0.04
  fts_name/fts_alias: lexicalScore starts around 0.78, then sorts by FTS rank
  trigram_name/trigram_alias:
    lexicalScore = trigram similarity
    length-aware thresholds:
      <= 3 chars: 0.70
      <= 5 chars: 0.55
      <= 8 chars: 0.45
      9+ chars: 0.35
  typo_name:
    only for restaurants/foods, not attributes;
    typed length >= 5;
    candidate name length within 2 chars;
    edit distance <= 2;
    lexicalScore around 0.72 so exact/prefix/FTS still win.

attribute_autocomplete:
  lexical gate:
    exact_name, exact_alias, prefix_name, or prefix_alias;
    prefix evidence requires typed length >= 3.

  support gate:
    attributeSupportScore =
      log2(1 + supportedRestaurantCount)
      + 0.5 * log2(1 + supportMentionCount)

    threshold: attributeSupportScore >= 3.1

  demand support:
    once user_search_demand_daily exists, attribute demand can also satisfy support:
      distinctUserDemandScore >= 2.0
    Do not require both collection support and distinct-user demand.
    Require at least one positive support path:
      collection support OR distinct-user demand support.

  This includes examples like outdoor seating/patio, serves brunch, good for children, and vegan.
  This excludes weak seed examples like best, great, and great wine list until they gain stronger support.

query_suggestion:
  prefix-only matching against normalized query text.
  Eligible from the first typed character.
  No fuzzy, trigram, or phonetic matching.
```

Attribute quality should come from positive signals, not deny lists:

```text
Good attribute candidate:
  strong lexical match
  plus broad/repeated user demand or durable quality metadata

Weak attribute candidate:
  weak lexical match
  or no meaningful user support
```

Autocomplete ranking should remain request-time and lightweight. It can read precomputed demand aggregates, but it should not write scoring traces per keystroke.

### Keyword Collection Priority

Purpose: decide what evidence/content to collect next.

Naming clarification:

```text
demand:
  user behavior signal.
  Examples: searches, low-result asks, autocomplete selections, favorites, views.

entity:
  known database object.
  Examples: a restaurant, food, food attribute, or restaurant attribute.

keyword term:
  text sent to Reddit search.
  Examples: "ethiopian breakfast", "ramen", "patio margaritas".

collection candidate:
  something we might collect for next.
  It can come from a known entity, an unmet user term, a stale successful term, or an explore term.

keyword collection:
  the job/action that searches Reddit for selected terms, then feeds posts/comments through extraction.
```

So the ideal name for this consumer is not really `entity priority`. A better product/architecture name is:

```text
keyword_collection_priority
```

`entity priority` is just one source of candidates inside keyword collection priority. Demand is not the same thing as keyword collection; demand is one major input into deciding which keyword collection candidates deserve resources.

Clean rename policy:

- There is no production/backward-compatibility constraint for this cutover.
- Use `keyword_collection_priority` as the durable domain name.
- New code should not introduce new `EntityPriority*` names.
- Existing `EntityPriority*` names should be renamed or deleted during implementation, not kept as compatibility wrappers.
- If the old summary table is still needed after the demand-table cutover, rename/rebuild it around keyword collection priority rather than entity priority.

Recommended naming:

```text
EntityPriorityMetricsRefreshService
  -> KeywordCollectionPrioritySignalRefreshService

EntityPriorityMetric
  -> KeywordCollectionPrioritySignal

collection_entity_priority_metrics
  -> collection_keyword_priority_signals

KeywordSliceSelectionService
  -> KeywordCollectionPriorityService

KeywordSlice
  -> KeywordCollectionBucket

KeywordTermCandidate
  -> KeywordCollectionCandidate

SLICE_QUOTAS
  -> KEYWORD_COLLECTION_BUCKET_TARGETS

slice
  -> bucket
```

Preferred long-term outcome: delete `collection_keyword_priority_signals` if `user_search_demand_daily`, score traces, and attempt/yield events fully cover the need. Do not preserve a summary table only because it exists today.

Current implementation:

- `collection_entity_priority_metrics` is refreshed daily by `EntityPriorityMetricsRefreshService`, but the live keyword selector does not primarily read it.
- `KeywordSliceSelectionService` is the real keyword collection decision maker.
- It builds four candidate slices:
  - `unmet`: terms from `collection_on_demand_requests`;
  - `refresh`: old terms from `collection_keyword_attempt_history`;
  - `demand`: known entities with query/view/favorite/autocomplete demand;
  - `explore`: locally interesting or newly trending entities.
- Current per-cycle caps are hard-coded:

```text
max terms per cycle: 25
unmet quota: 5
refresh quota: 10
demand quota: 8
explore quota: 2
```

- Current demand scoring uses capped normalized logs:

```text
favorite users:            0.35 weight, cap 10
card/view engagement:      0.20 weight, cap 25
autocomplete selections:   0.15 weight, cap 25
primary query users:       0.30 weight, cap 50
```

- Current unmet scoring uses a flat reason severity and capped distinct users:

```text
unresolved: 1.0
low_result: 0.8
distinct users cap: 25
recency boost: 0.7 + 0.3 * exp(-days / 7)
```

- Current refresh scoring uses keyword attempt staleness, saturating around 90 days.
- Current no-results handling is partly hard cooldown and partly flat suppression:
  - no-results cooldown is `max(60 days, safeIntervalDays * 3)`;
  - unmet candidates with a recent no-results attempt get `score * 0.3` for 60 days.
- Current hot-spike logic is separate from normal ranking and uses hard distinct-user thresholds:

```text
25 distinct users in 24h
or 10 distinct users in 24h and 3x previous 24h
```

Current issues:

- There are two possible metric truths: `collection_entity_priority_metrics` and the direct SQL inside `KeywordSliceSelectionService`.
- Hard slice quotas can dominate actual candidate quality.
- Capped normalization makes additional broad demand invisible after the cap.
- On-demand/unmet scoring does not match the new low-result severity, per-user log intensity, recency, no-results recovery, or hot-spike curves.
- Hot-spike is only connected to on-demand rows and uses different math from the rest of the demand layer.
- Attempt history is only latest-state summary, so it is weak for yield tuning over time.
- Term-level scoring is mostly in logs, not durable score traces.

Locked target shape:

- Treat keyword collection priority as one `keyword_collection` scoring consumer of the shared demand layer.
- Keep `collection_keyword_attempt_history` as the latest-state/cooldown table.
- Add append-only keyword attempt events later so tuning can compare score inputs to collection yield over time.
- Do not build new ranking logic on `collection_entity_priority_metrics`; rename/delete it during the cutover.
- Prefer `user_search_demand_daily` plus scoring traces as the future source for demand and ranking explanation.
- If a dedicated summary table remains useful, use `collection_keyword_priority_signals`; do not keep the old entity-priority table/model names.
- Use score traces with `consumerKind = keyword_collection` and `consumerKind = keyword_hot_spike`.

Why this is better than the current implementation:

- One ranking owner: today, priority is split across `collection_entity_priority_metrics`, direct selector SQL, hard slice quotas, hot-spike logic, and attempt cooldowns. The target shape makes keyword collection priority the single owner of the decision.
- Comparable-enough overflow: today, `unmet`, `refresh`, `demand`, and `explore` are selected inside mandatory quota buckets. The v1 target keeps buckets, but makes each bucket traceable, quality-gated, and able to release unused capacity into a weighted overflow pass. It does not require raw bucket scores to be globally comparable.
- No arbitrary caps hiding real demand: today, capped normalized scores stop caring after thresholds such as 10 favorite users or 50 query users. The target shape uses per-user log demand, so extra demand keeps mattering but with natural diminishing returns.
- Shared demand semantics: today, on-demand, hot-spike, polls, and keyword selection use different demand math. The target shape uses the same demand layer and curves, then lets each consumer apply its own need/cooldown factors.
- Better collection judgment: today, user demand can rank high even when collection may not help, or stale refresh can consume quota because a bucket exists. The target shape preserves bucket intent while preventing weak candidates from consuming reserved slots just because the bucket has quota.
- Better tuning: today, term summaries are mostly logs and latest-state attempt history. The target shape writes score traces and append-only attempt/yield events, so future tuning can explain why a candidate won and whether it produced useful evidence.
- Clearer product language: `entity priority` sounds like ranking database entities, but the real decision is which keyword collection work deserves resources. The target shape names that directly as `keyword_collection_priority`.

Recommended candidate kinds:

```text
unmet_term
refresh_term
demand_entity
explore_entity
```

All candidate kinds should normalize into one traceable candidate shape:

```text
term
normalizedTerm
marketScopeKey
collectableMarketKey
candidateKind
subjectKind
subjectKey
entityId/entityType when present
bucketLocalScore
bucketRank
factorBreakdown
```

Important v1 constraint: do not pretend bucket scores are perfectly comparable yet. The selector should improve scoring inside each bucket first, preserve the product intent of the current distribution, and use adaptive fill only for unused or clearly weak capacity.

Long-term shared factor model:

```text
keywordCollectionPriority =
  collectionDemand
  * collectionNeed
  * recencyWeight
  * attemptAvailability
  * trendBoost when running the hot-spike lane
```

Where:

```text
collectionDemand =
  1.00 * queryDemand
  + 1.20 * explicitAutocompleteDemand
  + 1.50 * favoriteDemand
  + 0.60 * viewDemand
  + unmetDemand
```

Each demand component should use the shared per-user log curve:

```text
componentDemand =
  sum over users log2(1 + recencyWeightedSignalCountByUser)
```

Why these initial weights:

- explicit autocomplete selection is stronger than an attributed query because the user picked a specific entity;
- favorite is strongest because it is durable preference, not just browsing;
- view/card engagement is real but weaker because it can be accidental or curiosity-driven;
- query demand remains a core collection signal because it says users are asking for the thing.

`collectionNeed` depends on candidate kind:

```text
unmet_term:
  reason/result severity from the on-demand model

refresh_term:
  refreshNeed = 1 - exp(-(daysSinceLastSuccessfulKeyword / max(45, safeIntervalDays))^2)

demand_entity:
  evidenceGapNeed from stale or thin collected evidence

explore_entity:
  novelty/local-specialization/trend need
```

Initial `explore_entity` need:

```text
exploreNeed =
  0.45 * novelty
  + 0.35 * localSpecialization
  + 0.20 * trend
```

This keeps the existing intuition but moves it into the same traceable factor model.

Recommended attempt availability:

```text
success:
  short operational cooldown, then normal refreshNeed controls priority

no_results:
  use the no-results recovery/resurgence curve from on-demand

error:
  short retry cooldown, default 1 day

deferred:
  short retry cooldown, default 6 hours
```

Selection policy:

Use bucketed soft-quota selection, not a fully universal cross-bucket ranker.

Keep the current bucket targets as product intent:

```text
max terms per cycle: 25
unmet target: 5
refresh target: 10
demand target: 8
explore target: 2
```

Treat those as target reservations, not mandatory fills.

Recommended algorithm: `selectWithSoftReservationsAndBackfill`.

1. Score and sort candidates inside each bucket using bucket-specific scoring.
2. Dedupe within each bucket by `normalizedTerm`, keeping the strongest candidate.
3. Convert scores to bucket-local quality, not global quality.
4. Apply an adaptive natural-break cutoff so weak candidates do not consume reserved slots.
5. Fill each bucket up to its target from candidates that pass those gates.
6. Dedupe across buckets by `normalizedTerm`; if multiple buckets produce the same term, keep the selected candidate with the strongest bucket-local claim and preserve secondary reasons in `factorBreakdown`.
7. Put unused capacity into an overflow pass.
8. Fill overflow from remaining gated candidates using a simple bucket-adjusted rank score, not raw cross-bucket scores.

Bucket-local quality:

```text
bucketRankQuality =
  candidate.bucketLocalScore / topBucketScore
```

If `topBucketScore <= 0`, the bucket contributes no reserved candidates. Otherwise, every candidate is judged relative to the strongest candidate in its own bucket.

Adaptive natural-break cutoff:

```text
qualities =
  bucket candidates sorted by bucketRankQuality descending

drops =
  qualities[i] - qualities[i + 1]

typicalDrop =
  median(drops)

dropSpread =
  median absolute deviation of drops

naturalBreak =
  first large drop where drop is meaningfully above typicalDrop + dropSpread
```

Select only candidates before that natural break, capped by the bucket target. If there is no meaningful break, fill up to the bucket target.

Why median/MAD instead of standard deviation:

- bucket candidate lists are small and often skewed;
- one extreme top candidate can distort average and standard deviation;
- median/MAD gives a stable "is this drop unusual for this bucket?" signal without a fixed global percentage such as 40%.

This is the v1 quality gate. Avoid adding fixed absolute score floors unless a bucket has invalid/zero scores or we learn from score traces that a specific bucket needs one.

Initial overflow score:

```text
bucketAdjustedOverflowScore =
  bucketRankQuality
  * bucketPriorityWeight
```

Where `bucketRankQuality` comes from the same bucket-local quality calculation used in the reservation pass.

Initial priority weights:

```text
unmet:   1.20
refresh: 1.10
demand:  1.00
explore: 0.70
```

These weights are not a claim that raw bucket scores are comparable. They only guide overflow when a reserved bucket does not have enough strong candidates.

Initial quality-gate shape:

```text
bucket-local quality:
  compare each candidate against the top candidate in its own bucket.

adaptive natural break:
  stop filling a bucket when there is a statistically unusual drop in quality.

overflow:
  let remaining strong candidates compete for unused capacity using bucket-local
  quality and bucket priority weight.
```

Example:

```text
refresh target is 10.
Only 4 refresh candidates are meaningfully stale/popular.
Select those 4, then let the remaining 6 slots flow to strong unmet/demand/explore candidates.

explore target is 2.
No explore candidate clears the novelty/local/trend floor.
Select 0 explore candidates rather than forcing weak exploration.

unmet target is 5.
Eight unmet candidates clear the floor.
Select 5 in the reservation pass, then let the remaining 3 compete in overflow.
```

This preserves the original product value of the buckets while avoiding the worst hard-quota failure: filling slots with weak candidates just because a bucket exists.

Scheduling policy:

- Keep daily keyword/on-demand repair cadence.
- Keep normal scheduled jobs as `source = scheduled`.
- Keep urgent jobs as `source = hot_spike`.
- Use the same hot-spike trend boost shape as on-demand instead of hard distinct-user thresholds.
- Keep heavy sorts (`relevance`, `top`) controlled by safe interval, but allow high-score hot-spike candidates to force heavy sorts when the resource budget allows.

Recommended score trace breakdown:

```json
{
  "collectionDemand": {
    "value": 14.2,
    "components": {
      "queryDemand": 6,
      "explicitAutocompleteDemand": 2.4,
      "favoriteDemand": 4.5,
      "viewDemand": 1.3,
      "unmetDemand": 0
    }
  },
  "collectionNeed": {
    "value": 0.72,
    "kind": "demand_entity",
    "inputs": {
      "daysSinceLastSuccessfulKeyword": 41,
      "safeIntervalDays": 60,
      "evidenceGap": "thin"
    }
  },
  "recency": {
    "value": 0.88
  },
  "attemptAvailability": {
    "value": 1,
    "lastOutcome": "success"
  },
  "trendBoost": {
    "value": 1,
    "applied": false
  }
}
```

Recommended yield feedback:

- Add append-only `collection_keyword_attempt_events` or equivalent.
- Record per term attempt:
  - `runId`;
  - `normalizedTerm`;
  - `collectableMarketKey`;
  - candidate kind/slice;
  - final score/rank;
  - sorts attempted;
  - posts/comments found;
  - connections/entities created or enriched;
  - outcome;
  - error kind if any.
- Keep `collection_keyword_attempt_history` as the latest-state summary derived from attempt events.

This lets us tune toward actual collection yield, not just user demand.

This is where power users can matter most. A single user repeatedly searching an under-served thing can push collection, even if it should not create a public poll yet.

### On-Demand Collection

Purpose: capture unmet demand.

Current implementation:

- `unresolved` requests are recorded when natural-language interpretation cannot resolve a requested term;
- `low_result` requests are recorded when a food/attribute search returns fewer than `SEARCH_ON_DEMAND_MIN_RESULTS` restaurants;
- requests are scoped by term, entity type, reason, and market;
- `collection_on_demand_request_users` tracks distinct users per request;
- repeated same-user records update recency, but do not store repeat intensity;
- a 5-minute cooldown suppresses repeated writes for the same request key;
- 90-day cleanup removes old request-user rows and recalculates `distinctUserCount`.

Current collection consumption:

- normal keyword selection gives `unmet` requests the first slice of the keyword queue;
- default normal selection looks back 30 days;
- `unmet` score is based mostly on distinct users, reason severity, and a small recency boost;
- `unresolved` is weighted higher than `low_result`;
- no-results attempt history softly suppresses repeat failed collection attempts;
- hot-spike collection only triggers for large distinct-user movement: 25 users in 24 hours, or 10 users with a 3x 24-hour trend.

Locked target shape:

- on-demand is the collection repair loop for unmet search demand;
- `collection_on_demand_requests` remains the durable request/queue state table;
- `user_search_demand_daily` is the derived scoring layer for intensity, recency, trend, and per-user log demand;
- normal keyword collection and on-demand/unmet terms run together in the scheduled keyword cycle;
- hot-spike is the only early path for urgent unmet demand;
- on-demand collection is independent from weekly poll release timing;
- hard caps remain only for resource protection, not demand truth.

Locked scoring model:

- keep `collection_on_demand_requests` as the current queue/state table;
- keep distinct users as the main community validation signal;
- add per-user repeat intensity through the shared demand layer, not by letting raw repeats inflate `distinctUserCount`;
- score unmet demand with the same power-user-safe shape:

```text
baseUnmetDemandScore =
  sum over users log2(1 + recencyWeightedUnmetAsksByUser)

normalOnDemandPriority =
  baseUnmetDemandScore
  * reasonOrResultSeverity
  * attemptAvailability

hotSpikePriority =
  baseUnmetScore24h
  * reasonOrResultSeverity
  * trendBoost
  * attemptAvailability
```

`recencyWeight` is applied inside `recencyWeightedUnmetAsksByUser`, so the normal priority formula is equivalent to:

```text
finalOnDemandPriority =
  base log demand
  * reason/result severity
  * recency weight
  * attempt availability
```

The hot-spike lane uses the same foundation, then adds `trendBoost` only when ranking urgent spike candidates. Normal scheduled collection should not get trend boost by default.

Locked reason/result severity:

```text
unresolvedSeverity = 1.0

coverage = clamp01(restaurantCount / targetRestaurantCount)
lowResultSeverity = 0.25 + 0.75 * (1 - coverage)^1.2
```

Use `SEARCH_ON_DEMAND_MIN_RESULTS` as the initial `targetRestaurantCount`, then tune by category if the product later needs different expectations.

With a target of 25 restaurants:

```text
0 results:  1.00 severity
5 results:  about 0.82 severity
10 results: about 0.66 severity
18 results: about 0.41 severity
23 results: about 0.29 severity
```

This keeps true missing or nearly-missing coverage urgent, while avoiding treating "23 results when we wanted 25" the same as "0 results."

Locked timing:

- 30-day active window for normal collection selection;
- same recency curve family as poll demand, but tuned to collection cadence;
- locked default: 3-day full-weight grace, then 14-day half-life;
- if keyword collection moves to a weekly cadence, use the poll-style 7-day full-weight grace;
- 90-day retention for long-tail per-user unmet demand evidence;
- keep hot-spike as a ranked fast lane for sudden unmet demand, not as the normal power-user path.

Locked scheduling:

Current live shape:

- keyword search scheduling is enabled by `KEYWORD_SEARCH_ENABLED`;
- schedules are initialized per collectable market/community;
- default keyword cycle interval is `KEYWORD_SEARCH_INTERVAL_DAYS = 1`;
- an in-memory timer checks due keyword searches every `KEYWORD_SEARCH_POLL_INTERVAL_MS`, default 1 hour;
- normal due jobs are enqueued as `source = scheduled`;
- hot-spike jobs can be enqueued early as `source = hot_spike`;
- there is no live code that explicitly aligns or alternates keyword/on-demand collection with the weekly poll release schedule.

Observed local `collection_communities` values:

```text
austinfood -> region-us-tx-austin -> safe_interval_days = 60
foodnyc    -> region-us-ny-new-york -> safe_interval_days = about 32.6
```

Important distinction:

- `KEYWORD_SEARCH_INTERVAL_DAYS` currently controls the normal keyword schedule next run.
- `collection_communities.safe_interval_days` is carried into keyword jobs, but in the keyword path it mainly controls heavy-sort cadence and attempt cooldowns.
- Chronological collection uses `safe_interval_days` more directly as a community collection interval.
- Scheduled keyword search and on-demand/unmet terms currently run together in one keyword term-selection cycle. The `unmet` slice is the on-demand slice, but the resulting job is still a keyword job.

Current mismatch:

- some code comments still say "monthly keyword search cycles with offset timing";
- some docs still say low-result search can "enqueue keyword search cycles";
- config still has old `instant` on-demand names;
- the implemented direction is closer to the existing plan: daily scheduled keyword cycles plus hot-spike early attempts, not immediate per-search on-demand processing.

Locked scheduling policy:

- keep on-demand collection independent from poll publishing;
- let poll cadence be weekly public release cadence;
- let keyword/on-demand collection be a daily repair/enrichment cadence;
- use hot-spike to pull urgent unmet terms forward instead of coupling collection to poll release;
- if we want coordination, do it as a collection policy: "give unmet/poll-needed candidates higher priority before poll release," not as a hard alternating schedule.

Locked timestamp cleanup:

- `OnDemandRequest.lastSeenAt` is correctly a request-level recency field.
- `OnDemandRequestUser.createdAt` is currently updated on repeat requests, so it behaves like per-user `lastSeenAt`, not creation time.
- Fix this by adding explicit per-user fields:

```text
firstSeenAt
lastSeenAt
askCount
```

Then:

- create sets all three;
- repeat asks preserve `firstSeenAt`, update `lastSeenAt`, increment `askCount`;
- 90-day cleanup deletes by `lastSeenAt`, not by a misleading `createdAt`;
- hot-spike and recency logic read `lastSeenAt` or the daily demand aggregate, not `createdAt`.

Recency model:

```text
graceDays = 3 for daily collection, 7 for weekly poll/collection cycles
ageAfterGraceDays = max(0, ageDays - graceDays)
recencyWeight = 0.5 ^ (ageAfterGraceDays / 14)
```

Examples:

```text
With 3-day collection grace:
0-3 days old: 1.00x
10 days old: about 0.71x
17 days old: 0.50x
31 days old: 0.25x
59 days old: 0.06x
```

This gives the current collection cycle full credit, then lets old unmet demand fade smoothly instead of falling off a cliff. Polls keep a longer full-weight grace because polls are weekly; on-demand collection can be more responsive because it can run more often.

Locked hot-spike refinement:

Current hot-spike uses hard distinct-user checks:

```text
25 distinct users in 24h
or 10 distinct users in 24h and 3x the previous 24h
```

Locked cutover:

```text
baseUnmetScore24h =
  sum over users log2(1 + unmetAsksByUserIn24h)

surgeRatio =
  baseUnmetScore24h / max(previous24hScore, rollingBaselineScore, 3)

surgeUnits =
  max(0, log2(surgeRatio) - 1)

trendBoost =
  1 + 1.5 * (1 - exp(-0.7 * surgeUnits))

hotSpikePriority =
  reasonOrResultSeverity
  * baseUnmetScore24h
  * trendBoost
  * attemptAvailability
```

Boost behavior:

```text
2x normal:  no boost
4x normal:  about 1.75x boost
8x normal:  about 2.10x boost
16x normal: about 2.30x boost
Maximum:     2.50x boost
```

Then spend the hot-spike resource budget on the highest-ranked eligible candidates. This keeps the same philosophy as polls: no explicit distinct-user guard and no market-relative denominator inside the demand score. A one-user power signal can win in a small market when it is the strongest unmet signal, while broader multi-user demand naturally beats it in a busy market because the ranked list has stronger candidates.

If cross-market fairness is needed, solve that with scheduling/resource allocation, such as per-market budgets or round-robin market picks, not by distorting the candidate demand score.

Locked hard threshold policy:

- Keep resource caps such as max terms per cycle and max jobs per run.
- Keep low-result detection as a coverage trigger, but convert result weakness into a severity score instead of treating all low-result cases equally.
- Do not let the 5-minute on-demand cooldown suppress demand facts in the aggregate table; use it only to reduce queue-state churn.
- Replace fixed `UNMET_DISTINCT_USERS_CAP` style scoring with per-user log demand and recency decay.
- Replace mandatory keyword slice fills with the bucketed soft-reservation/backfill selector described in the keyword collection section. Preserve bucket intent; do not force weak candidates just to fill a slice.
- Replace flat no-results suppression with a recovery curve so failed attempts recover gradually instead of staying equally suppressed until the window expires.

Locked no-results recovery:

```text
surgeUnits =
  max(0, log2(surgeRatio) - 1)

resurgenceCreditDays =
  min(35, 14 * surgeUnits)

effectiveDays =
  daysSinceNoResults + resurgenceCreditDays

attemptAvailability =
  1 - exp(-(effectiveDays / 45)^2)
```

Without resurgence:

```text
7 days after no-results attempt:  about 0.02 availability
14 days:                          about 0.09 availability
30 days:                          about 0.36 availability
45 days:                          about 0.63 availability
60 days:                          about 0.83 availability
90 days:                          about 0.98 availability
```

With resurgence:

```text
30 days old + 4x new demand: behaves about 44 days old
30 days old + 8x new demand: behaves about 58 days old
30 days old + 16x new demand: behaves about 65 days old because credit is capped
```

This prevents immediate retry loops after a failed collection attempt, but lets a real new spike pull the topic back into competition before the old fixed 60-day window would have allowed it.

In practice:

```text
One user searches "Ethiopian breakfast" eight times and gets weak results.
  Collection should eventually try it because the app is under-serving them.

Ten users search "Ethiopian breakfast" once and get weak results.
  Collection should prioritize it higher because it is clearly a market-wide gap.

Twenty-five users hit it in one day.
  Hot-spike collection can jump the normal queue.
```

Worked scoring examples:

```text
Tiny-market power user:
  One user searches "Ethiopian breakfast" 8 times in 2 days.
  App only has 3 restaurants against a target of 25.
  baseUnmetDemandScore = log2(1 + 8) = about 3.17.
  lowResultSeverity = about 0.89.
  attemptAvailability = 1 if never attempted.
  normal priority = about 2.82.

  Meaning: one serious early user can create enough signal to be considered,
  but this does not beat clear multi-user demand by default.

Broad fresh demand:
  Six users search the same weak-coverage term once this week.
  baseUnmetDemandScore = 6.
  lowResultSeverity = about 0.89.
  normal priority = about 5.34.

  Meaning: breadth beats one person repeating, but the repeat user still matters.

Almost-enough coverage:
  Twelve users search "late night ramen" once.
  App has 23 restaurants against a target of 25.
  baseUnmetDemandScore = 12.
  lowResultSeverity = about 0.29.
  normal priority = about 3.48.

  Meaning: broad demand can still push a near-covered topic up,
  but missing coverage is more urgent than slightly-thin coverage.

Stale long-tail demand:
  Six users searched an unresolved term 31 days ago and nobody searched it again.
  Each one-ask user is worth log2(1 + 0.25) = about 0.32 after recency decay.
  baseUnmetDemandScore = about 1.93.
  unresolvedSeverity = 1.
  normal priority = about 1.93.

  Meaning: old demand is remembered, but it yields to newer demand unless it was very strong.

No-results recovery:
  A term was collected 30 days ago and found no results.
  It now gets 8 fresh user-score points.
  Without resurgence, attemptAvailability is about 0.36,
  so priority is about 2.88.
  If demand is an 8x spike, resurgence credit makes it behave about 58 days old,
  attemptAvailability rises to about 0.81,
  and priority becomes about 6.48.

  Meaning: failed topics do not retry constantly, but a real new spike can revive them.

Hot spike:
  A term's normal 24-hour baseline is 3 user-score points.
  Today it gets 12.
  surgeRatio = 4x, trendBoost = about 1.75x.
  With 0.89 severity and no attempt suppression,
  hotSpikePriority = about 18.69.

  Meaning: a sudden gap can jump the daily queue without needing a hard
  "25 distinct users" gate.
```

Locked `user_search_demand_daily` usage:

1. Search records raw/search facts as it does today.
2. If the search has unresolved terms, write `signalKind = unresolved_query`.
3. If the search has weak results, write `signalKind = low_result`.
4. Keep `collection_on_demand_requests` as the current request/queue state.
5. Normal keyword selection reads the daily demand table, groups by term/entity/market/reason, scores with log demand plus recency plus severity, then ranks candidates.
6. Hot-spike reads the same daily table over the last 48 hours, compares current 24-hour score to previous 24-hour score, then enqueues only the strongest eligible candidates.
7. `OnDemandRequestUser` can stay as a denormalized distinct-user/request table, but the richer repeat-intensity math should come from the demand aggregate.

Locked table ownership: do not replace `collection_on_demand_requests` with `user_search_demand_daily`.

The split should be:

```text
collection_on_demand_requests:
  stable actionable request/queue state
  requestId
  canonical term/entity/market/reason
  entity link
  result-count/context metadata
  current last-seen summary

user_search_demand_daily:
  derived scoring facts
  day/user/signal buckets
  repeat intensity
  recency windows
  trend comparisons
  backfillable aggregate
```

Why keep both:

- the demand table is derived and can be rebuilt, so it should not be the only durable record of an actionable collection target;
- on-demand requests need stable identity and request metadata that daily buckets should not own;
- entity merge/rehome logic currently updates on-demand request entity links;
- collection attempt history and future queue state need a stable target key independent of daily aggregation windows;
- daily aggregates are excellent for ranking and scoring, but awkward as the canonical queue table.

Long-term cleanup can make `collection_on_demand_requests` slimmer by removing fields that are only cached scoring summaries, but it should remain the collection-request state table.

Locked terminology cleanup:

- `onDemandQueued` currently means demand was recorded, not that a keyword job was definitely enqueued.
- Search docs and response metadata should use wording like `onDemandRecorded`, `coverageDemandRecorded`, or `collectionDemandRecorded`.
- Old `instant` on-demand config names should be deleted or renamed unless a real immediate enqueue path exists.

### Poll Topic Planning

Purpose: create public/community poll topics.

Current issue:

- raw `COUNT(*)` in a 14-day window can over-count one user or duplicated attribution rows.

Recommended policy:

- use summed per-user log demand as the main rank signal;
- give demand one full weekly poll cycle at full weight;
- decay older demand smoothly instead of using a 14-day cliff;
- use a cooldown curve instead of only a fixed hard ban;
- allow true resurgence to soften cooldown when demand is newly much stronger;
- keep only integrity gates: valid target entity/topic, market scope, non-duplicate active/ready topic.

Suggested demand scoring:

```text
candidateScore =
  sum over users:
    log2(1 + recencyWeightedAsksByUser)

recencyWeightedAsk =
  1.0 for asks in the current weekly poll cycle
  after 7 days, decays with a 14-day half-life
```

That makes repeat power-user demand matter without scaling linearly forever:

```text
1 ask   = 1.0 user contribution
3 asks  = 2.0
7 asks  = 3.0
15 asks = 4.0
31 asks = 5.0
```

There should not be a tiered adaptive threshold for early vs. mature markets. The ranked list should naturally scale because a one-user power topic can rank high in a tiny market, while broad multi-user demand wins in a mature market.

Final ranking should be:

```text
finalPollRankScore =
  baseDemandScore
  * cooldownAvailability
  * resurgenceRelief
  * diversityAdjustment
```

`diversityAdjustment` should stay small and policy-driven, such as avoiding three nearly identical taco polls in the same city release. It should not replace the demand score.

#### Poll Recency Curve

Because polls publish weekly, new demand should get one full release cycle at full value.

Recommended weights:

```text
0-7 days old:   100%
14 days old:    ~71%
21 days old:    ~50%
35 days old:    ~25%
63 days old:    ~6%
```

Formula:

```text
ageAfterGraceDays = max(0, ageDays - 7)
recencyWeight = 0.5 ^ (ageAfterGraceDays / 14)
```

Why this shape:

- A topic that barely misses this week is still strong next week.
- Fresh weekly demand gets a full chance to make the next release.
- Stale demand fades without a hard cliff.
- Old backlog cannot dominate forever just because it was once popular.

#### Poll Cooldown Curve

Cooldown should mostly prevent recently polled topics from repeating, but it should be a smooth penalty rather than only a binary rule.

Recommended shape:

```text
daysSincePoll = days since this target entity/topic was last polled

cooldownAvailability =
  1 - exp(-((daysSincePoll - hardRestDays) / recoveryDays)^2)
```

With:

```text
hardRestDays = 7
recoveryDays = 28
```

Then clamp:

```text
if daysSincePoll < 7:
  cooldownAvailability = 0
else:
  cooldownAvailability between 0 and 1
```

Approximate behavior:

```text
0-7 days:   0.00, cannot repeat
14 days:    0.06, almost fully suppressed
21 days:    0.22, heavily suppressed
30 days:    0.48, still penalized
45 days:    0.84, mostly recovered
60 days:    0.97, effectively recovered
```

This preserves the current intent behind 60-day cooldowns without a sharp step function.

#### Poll Resurgence

Resurgence should not be a separate boost that makes old popular topics even more dominant. It should only relieve cooldown when current demand is clearly stronger than the topic's normal baseline.

Recommended shape:

```text
resurgenceRatio =
  current7dDemandScore / max(previousComparable7dDemandScore, smallBaseline)
```

Then convert the resurgence into "cooldown age credit" instead of multiplying the candidate score directly:

```text
surgeUnits = max(0, log2(resurgenceRatio) - 1)
resurgenceCreditDays = 28 * (1 - exp(-0.7 * surgeUnits))

effectiveDaysSincePoll =
  daysSincePoll + resurgenceCreditDays
```

Approximate behavior:

```text
2x surge:   ~0 days credit
3x surge:   ~7 days credit
4x surge:   ~14 days credit
8x surge:   ~28 days credit
16x surge:  ~35 days credit
```

Plain meaning:

- If current demand is about the same as usual, there is no relief.
- If current demand is only about 2x the recent baseline, cooldown still mostly applies.
- If current demand is 4x, the topic behaves roughly two weeks farther through cooldown.
- If current demand is 8x, the topic behaves roughly a month farther through cooldown.
- It still cannot bypass the first 7-day hard rest.

The final cooldown effect should be:

```text
if daysSincePoll < hardRestDays:
  cooldownAvailability = 0
else:
  cooldownAvailability = cooldownCurve(effectiveDaysSincePoll)
```

This means resurgence helps only when the topic is newly hot. It does not make old evergreen topics permanently unbeatable, and it is easier to reason about than a generic score multiplier.

#### Poll Candidate Examples

Tiny early market:

```text
Only one active search user.
They search "Persian breakfast" 15 times this week.

baseDemandScore = log2(16) = 4
no cooldown
final score = 4

This can become a poll because it is the strongest real signal in the city.
```

Growing market:

```text
Candidate A: one power user asks 15 times -> score 4
Candidate B: four users ask once each -> score 4
Candidate C: two users ask 7 times each -> score 6

C ranks first, while A and B compete naturally.
```

Mature market:

```text
Candidate A: one power user asks 31 times -> score 5
Candidate B: 20 users ask once each -> score 20
Candidate C: 8 power users ask 7 times each -> score 24

Broad support wins, but clusters of power users can still beat broad shallow demand.
```

Backlog carryover:

```text
Week 1:
  A/B/C publish.
  D and E narrowly miss, but have strong demand.

Week 2:
  A/B/C are in cooldown.
  D and E still retain most of their score because demand from last week is only 7-14 days old.
  D and E can now publish instead of being forgotten.
```

Stale backlog:

```text
Topic X was huge 90 days ago but has had no new searches.
Its recency weight is near zero.
It no longer blocks fresher topics.
```

Resurgence:

```text
"Best tacos" was polled 25 days ago.
Normal cooldown availability is around 0.35-0.45.

If demand is normal:
  it stays suppressed.

If current 7-day demand is 4x higher than its baseline:
  it gets about 14 credit days.
  it behaves like it was polled about 39 days ago.
  it can compete better, but still carries some cooldown penalty.

If current 7-day demand is 8x higher than its baseline:
  it gets about 28 credit days.
  it behaves like it was polled about 53 days ago.
  it can mostly compete normally because users are clearly asking again now.
```

## How This Scales

### Very Few Users

Problem: strict distinct-user thresholds can starve the system.

Recommended behavior:

- local recents/autocomplete personal UX responds immediately;
- on-demand/collection can react to one power user with repeated log-scaled demand;
- public polls can be created from one strong user when that is genuinely the strongest city signal.

Example:

```text
One user searches "Ethiopian breakfast" seven times.

Personal UX: updates immediately.
Collection: eligible because repeated unmet demand is useful.
Poll topic: can rank if there is not stronger demand elsewhere in the city.
```

### Hundreds Or Thousands Of Users

Problem: raw counts can be dominated by repeated behavior or noisy broad queries.

Recommended behavior:

- poll/global systems use distinct users and market-relative thresholds;
- power-user intensity remains log-scaled, not linear;
- recency decay keeps stale demand from owning the queue.

### Tens Or Hundreds Of Thousands Of Users

Problem: direct raw-log queries become expensive and less explainable.

Recommended behavior:

- maintain daily aggregate buckets;
- query aggregates for products;
- keep raw logs for audit/backfill;
- use percentile/rank-based thresholds per market instead of only absolute counts.

## Rollout Plan

### Phase 1: Protect Existing Consumers

1. Add `eventKind` to `SearchLog`, defaulting existing rows to `backend`.
2. Update all raw-log demand consumers to filter explicit event kinds.
3. Change poll demand from raw `COUNT(*)` to recency-weighted per-user log demand.
4. Add cache reveal logging only after the shared aggregation helpers/delete gates make raw `COUNT(*)` demand unsafe to reintroduce.
5. Use cache reveal rows for server history/personal UX first; keep them excluded from public/community demand unless a consumer explicitly opts in.

### Phase 2: Introduce Demand Service

Create a backend `DemandSignalService` used by:

- poll scheduler;
- autocomplete popularity;
- query suggestions;
- keyword collection priority refresh.

It should expose methods like:

```ts
getEntityDemandForMarket({ marketKey, windowDays, entityTypes })
getQueryDemand({ prefix, scope, windowDays })
getUserRecentDemand({ userId, limit })
```

### Phase 3: Add Aggregate Tables Or Materialized Views

When volume requires it, add daily aggregate storage:

```text
user_search_demand_daily
  day
  market_key
  collectable_market_key
  subject_kind
  subject_key
  entity_id
  entity_type
  user_id
  signal_kind
  signal_count
  first_seen_at
  last_seen_at
```

This can be refreshed periodically and backfilled from raw events.

Recommended table name: `user_search_demand_daily`.

Why:

- `user_` matches the existing source family (`user_search_logs`, `user_events`) and makes it clear this is derived from user behavior.
- `search_demand` is generic enough for polls, collection, autocomplete, and suggestions.
- `daily` makes the aggregation grain explicit.
- It avoids naming the table after one consumer, such as polls or collection.

Naming alternatives considered:

```text
user_search_interest_daily
  Softer product wording, but less precise for collection/poll ranking.

search_demand_daily
  Clean, but it does not follow the current prefix style as clearly.

analytics_search_demand_daily
  Technically accurate, but introduces a new table prefix not currently used.

collection_search_demand_daily
  Fits collection, but too narrow because polls and autocomplete will also read it.
```

Initial Prisma shape:

```prisma
model UserSearchDemandDaily {
  day                   DateTime
  marketScopeKey        String     @map("market_scope_key") @db.VarChar(255)
  marketKey             String?    @map("market_key") @db.VarChar(255)
  collectableMarketKey  String?    @map("collectable_market_key") @db.VarChar(255)
  subjectKind           String     @map("subject_kind") @db.VarChar(32)
  subjectKey            String     @map("subject_key") @db.VarChar(255)
  entityId              String?    @map("entity_id") @db.Uuid
  entityType            EntityType? @map("entity_type")
  userScopeKey          String     @map("user_scope_key") @db.VarChar(255)
  userId                String?    @map("user_id") @db.Uuid
  signalKind            String     @map("signal_kind") @db.VarChar(64)

  signalCount           Int        @default(0) @map("signal_count")

  firstSeenAt           DateTime?  @map("first_seen_at")
  lastSeenAt            DateTime?  @map("last_seen_at")
  createdAt             DateTime   @default(now()) @map("created_at")
  updatedAt             DateTime   @updatedAt @map("updated_at")

  @@id([day, marketScopeKey, subjectKind, subjectKey, userScopeKey, signalKind])
  @@index([marketKey, day, signalKind], map: "idx_user_search_demand_market_day_signal")
  @@index([collectableMarketKey, day, signalKind], map: "idx_user_search_demand_collectable_market_day_signal")
  @@index([entityId, day, signalKind], map: "idx_user_search_demand_entity_day_signal")
  @@index([subjectKind, subjectKey, day, signalKind], map: "idx_user_search_demand_subject_day_signal")
  @@map("user_search_demand_daily")
}
```

`signalKind` keeps the table generic enough for all consumers without adding a new column for every new signal.

Recommended initial signal kinds:

```text
backend
cache
autocomplete_submit
recent_submit
unresolved_query
low_result
restaurant_view
favorite
```

One raw user action can emit more than one daily signal. Example: a backend search from autocomplete that returns weak food results can emit `backend`, `autocomplete_submit`, and `low_result` rows. Consumers then choose exactly which signal kinds they accept.

The null-safe `marketScopeKey` and `userScopeKey` fields avoid nullable primary-key problems while preserving nullable relational fields for normal joins.

### Phase 4: Add Shared Scoring Trace Tables

Ranked demand consumers should store score breakdowns through one shared trace shape, not separate ad hoc JSON blobs per service.

Status: provisional until every consumer is finalized.

The scoring-trace idea is still right, but the schema should stay flexible while query suggestions, autocomplete popularity, and any remaining demand consumers are reviewed. The stable principle is: trace batch ranking decisions, not every raw user event and not every request-time autocomplete keystroke.

Use traces immediately for:

- weekly poll topic planning;
- scheduled on-demand collection candidate ranking;
- keyword collection priority refresh;
- materialized global query suggestion refresh, if we create one later.

Avoid traces initially for:

- personal recents;
- request-time autocomplete ranking;
- simple intra-bucket keyword list debugging unless it selects work or rejects a meaningful candidate.

For keyword collection specifically, trace selected candidates plus the strongest rejected/overflow candidates per run. Do not store every low-quality candidate unless volume is still tiny and we are actively tuning the selector.

Use two tables:

```text
user_search_demand_score_runs
  one row per batch/ranking execution

user_search_demand_candidate_scores
  one row per scored candidate within a run
```

Recommended run table:

```prisma
model UserSearchDemandScoreRun {
  runId                 String   @id @default(dbgenerated("gen_random_uuid()")) @map("run_id") @db.Uuid
  consumerKind          String   @map("consumer_kind") @db.VarChar(64)
  marketScopeKey        String   @map("market_scope_key") @db.VarChar(255)
  marketKey             String?  @map("market_key") @db.VarChar(255)
  collectableMarketKey  String?  @map("collectable_market_key") @db.VarChar(255)
  scorerVersion         String   @map("scorer_version") @db.VarChar(64)
  configHash            String   @map("config_hash") @db.VarChar(64)
  windowStart           DateTime @map("window_start")
  windowEnd             DateTime @map("window_end")
  candidateCount        Int      @default(0) @map("candidate_count")
  selectedCount         Int      @default(0) @map("selected_count")
  metadata              Json?    @default("{}")
  startedAt             DateTime @default(now()) @map("started_at")
  completedAt           DateTime? @map("completed_at")
  candidateScores       UserSearchDemandCandidateScore[]

  @@index([consumerKind, startedAt(sort: Desc)], map: "idx_user_search_demand_score_runs_consumer_time")
  @@index([marketScopeKey, consumerKind, startedAt(sort: Desc)], map: "idx_user_search_demand_score_runs_market_consumer_time")
  @@map("user_search_demand_score_runs")
}
```

Recommended candidate-score table:

```prisma
model UserSearchDemandCandidateScore {
  runId                 String   @map("run_id") @db.Uuid
  consumerKind          String   @map("consumer_kind") @db.VarChar(64)
  marketScopeKey        String   @map("market_scope_key") @db.VarChar(255)
  subjectKind           String   @map("subject_kind") @db.VarChar(32)
  subjectKey            String   @map("subject_key") @db.VarChar(255)
  entityId              String?  @map("entity_id") @db.Uuid
  entityType            EntityType? @map("entity_type")
  signalKind            String?  @map("signal_kind") @db.VarChar(64)
  rank                  Int?
  finalScore            Float    @map("final_score")
  selected              Boolean  @default(false)
  decision              String   @default("not_selected") @db.VarChar(64)
  factorBreakdown       Json     @map("factor_breakdown")
  inputSummary          Json?    @default("{}") @map("input_summary")
  createdAt             DateTime @default(now()) @map("created_at")

  run                   UserSearchDemandScoreRun @relation(fields: [runId], references: [runId], onDelete: Cascade)

  @@id([runId, subjectKind, subjectKey, consumerKind])
  @@index([consumerKind, marketScopeKey, finalScore(sort: Desc)], map: "idx_user_search_demand_candidate_scores_rank")
  @@index([subjectKind, subjectKey, createdAt(sort: Desc)], map: "idx_user_search_demand_candidate_scores_subject_time")
  @@index([selected, consumerKind, createdAt(sort: Desc)], map: "idx_user_search_demand_candidate_scores_selected")
  @@map("user_search_demand_candidate_scores")
}
```

Important rules:

- Store scoring runs, not every raw user search. Raw events stay in `user_search_logs` and `user_search_demand_daily`.
- Store candidate scores when a batch consumer ranks candidates: poll topic planning, on-demand collection, materialized global suggestions, and keyword collection priority refresh.
- Persist all selected candidates plus the top rejected candidates per market/run. Store all candidates while volume is small; add top-N retention when needed.
- Do not store raw user IDs inside `factorBreakdown`. Use aggregate counts and weighted scores.
- Keep `finalScore`, `rank`, `selected`, and `decision` as columns for easy querying. Keep detailed factor math in `factorBreakdown` JSON so formulas can evolve.
- Include `scorerVersion` and `configHash` on every run so future tuning can explain which equation produced a result.

Shared breakdown shape:

```json
{
  "baseDemand": {
    "value": 8,
    "source": "user_search_demand_daily",
    "windowDays": 30
  },
  "reasonOrResultSeverity": {
    "value": 0.89,
    "inputs": {
      "reason": "low_result",
      "restaurantCount": 3,
      "targetRestaurantCount": 25
    }
  },
  "recency": {
    "value": 1,
    "inputs": {
      "graceDays": 3,
      "halfLifeDays": 14
    }
  },
  "attemptAvailability": {
    "value": 0.81,
    "inputs": {
      "lastOutcome": "no_results",
      "daysSinceNoResults": 30,
      "resurgenceCreditDays": 28
    }
  },
  "trendBoost": {
    "value": 2.1,
    "applied": true,
    "inputs": {
      "surgeRatio": 8
    }
  }
}
```

This makes a future tuning question answerable from data:

```text
Why did this on-demand term win?
Why did this poll topic lose?
Was it low base demand, stale recency, cooldown, result severity, or resource budget?
What would have happened under scorer version v2?
```

Use structured logs as a companion, not the source of truth. Logs should include `runId`, `consumerKind`, selected count, candidate count, scorer version, and the top selected candidate summaries. The database trace is what supports real tuning and historical comparisons.

### Phase 5: Durable Cache-Reveal History

Only after consumers are protected:

- write `cache` events if cross-device server history should match local recents;
- keep `cache` excluded from backend demand and collection demand by default.

## First Code Change I Recommend

Do not start by logging cache hits until `eventKind` and the shared aggregation/delete gates exist.

Start by adding `eventKind` and fixing poll demand because poll demand is currently the least aligned raw-log consumer:

```text
SearchDemandService:
  raw impressions -> recency-weighted per-user log demand

PollSchedulerService:
  minImpressions -> minDemandScore / ranked candidate selection
```

That gives us the safest base before expanding event meanings.

## Open Decisions

1. Should server history match local recents exactly?
   - Current recommendation: yes, after `eventKind` filtering and shared aggregation helpers are in place.
   - Cache rows should be personal/history events first, not global demand.

2. Should query suggestions use cache reveals?
   - Personal: yes, once cache rows are durable.
   - Global: no, or very low weight.

3. Should keyword collection keep a dedicated priority-signal summary table?
   - Preferred outcome: no, if `user_search_demand_daily`, score traces, and attempt/yield events fully cover the need.
   - If a summary table remains useful, use `collection_keyword_priority_signals`, not the old entity-priority name.

4. Should cache reveals ever become product demand?
   - Recommendation: not for polls, collection, or global popularity by default.
   - They may become personal-history events after consumers explicitly filter event kinds.

5. What exact lexical thresholds should each text-match profile use?
   - Locked thresholds are recorded in the autocomplete fixture pass.
   - Before implementation, convert those fixtures into automated tests so the cutover cannot regress:
     - `su` should not produce zero-confidence prefix candidates;
     - `tac` should find `taco` through prefix evidence;
     - `patio` should find `outdoor seating` through exact alias evidence;
     - `suhsi` should not become `sauce` through raw phonetic evidence;
     - weak attributes like `best` and `great` should not enter user-facing autocomplete without stronger support.
