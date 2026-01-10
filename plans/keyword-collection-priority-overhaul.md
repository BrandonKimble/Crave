# Keyword Collection Priority Overhaul (Entity Priority + On‑Demand)

## Summary

Scheduled keyword collection currently selects entities via `EntityPrioritySelectionService.selectTopPriorityEntities()` and then runs Reddit keyword searches using **entity name text only** (not entity id/type). This plan turns the discussion into an actionable implementation roadmap that:

- fixes a confirmed recency inversion bug (fresh entities currently score higher, but we want stale entities to be refreshed),
- prevents duplicate keyword searches when multiple entities share the same `name` (e.g., `pizza` as `food` and `food_attribute`),
- rebalances scoring weights so “user demand” meaningfully drives selection,
- upgrades demand signals toward **distinct-user** semantics (spam‑resistant) using existing event/source tables,
- decides how (and whether) to consolidate “on-demand” collection into the scheduled keyword collection system for better scaling/predictability.

## Goals / Non‑Goals

### Goals

- Make selected keywords reflect the “perfect keyword” definition:
  - high user value (searched/selected/viewed/favorited by users),
  - stale enough that new collection improves UX,
  - real enough (quality/foundation) that enrichment is likely to yield useful data,
  - includes high-signal unmet demand (on-demand) without creating unpredictable load.
- Ensure each scheduled keyword search run is dominated by **unique keyword strings** (not duplicated by entity type).
- Make demand signals more robust by emphasizing **unique users** (or at least unique searches) over raw counts.
- Keep selection/collection scalable and tunable with clear budgets and time windows.

### Non‑Goals (for this plan)

- Poll topic selection (explicitly deferred).
- Redesigning entity resolution or the data model for entities beyond what’s needed for demand/priority signals.
- Rewriting the Reddit ingestion pipeline (only touch what’s necessary for keyword selection and execution).

## Current System (as implemented)

### Scheduled keyword collection path

- Scheduler: `apps/api/src/modules/content-processing/reddit-collector/keyword-search-scheduler.service.ts`
  - Default run cadence is `KEYWORD_SEARCH_INTERVAL_DAYS` (currently defaults to `7`).
  - Location demand filter comes from `SearchDemandService` which aggregates `user_search_logs` counts per entity per location.
- Entity ranking: `apps/api/src/modules/content-processing/reddit-collector/entity-priority-selection.service.ts`
  - Composite score = `dataRecency * 0.40 + dataQuality * 0.35 + userDemand * 0.25 (+ newEntityBoost)`
  - `userDemand = 0.60 * connectionDemand + 0.40 * appDemand` (configurable via env)
  - `appDemand` uses counters in `collection_entity_priority_metrics`:
    - `queryImpressions` (bumped per search submission for each resolved target entity)
    - `autocompleteSelections` (bumped when `submissionSource='autocomplete'` and selected entity is non-restaurant)
    - `viewImpressions` (bumped on restaurant profile open)
    - `favoriteCount` (bumped on favorite add/remove)
- Keyword execution: `apps/api/src/modules/content-processing/reddit-collector/keyword-search-orchestrator.service.ts`
  - Uses `entities.map(e => e.entityName)` and searches Reddit by **name text only**.

### On-demand collection path

- Requests recorded via `OnDemandRequestService` into `collection_on_demand_requests`.
- Processing/queueing via `OnDemandProcessingService`:
  - `unresolved` requests require `occurrenceCount >= 3` before execution (anti-spam).
  - `locationKey='global'` requests are recorded but not executed.
  - Execution runs the same keyword search orchestrator, usually with the nearest subreddit for the request’s location.

### Confirmed issues from code review

1. **Recency inversion bug**

- `calculateDataRecencyScore()` explicitly scores “more recent” higher. This is opposite the intended behavior for “what should be refreshed next”.

2. **Duplicate keyword execution risk**

- Because keyword collection runs by `entityName`, selecting multiple entities with the same name wastes keyword slots and Reddit API calls (same query repeated).

3. **User-demand underweighted (and partially noisy)**

- With the current top-level weights, app demand is a small slice of the total score.
- `queryImpressions` is “entity appeared as a resolved target” (can include multiple entities per search), so it is weaker intent than explicit selection/view/favorite signals.

4. **Demand signals are raw counts, not distinct users**

- A single user can inflate counts by repeating actions (especially `queryImpressions` and `occurrenceCount`).

## Decisions Captured From the Conversation

### Locked / confirmed direction

- Fix recency inversion (stale should score higher).
- Deduplicate by keyword text so the same string doesn’t occupy multiple slots.
- Overhaul weights so user demand is meaningfully represented.
- Prefer **equal conceptual weight** between:
  - `autocompleteSelections` (high-intent for non-restaurants)
  - `viewImpressions` (high-intent for restaurants)
- Increase the weight/importance of favorites.
- Preferred on-demand direction: incorporate Option **B** (feed on-demand into priority) and Option **C** (budgeted top‑K selection), and strongly consider distinct-user counting.

### Still open / needs explicit choice

- Whether to remove (or keep) traditional on-demand execution once scheduled keyword collection runs more frequently.
- Whether to change EntityPriorityMetric counters from real-time increments to cached aggregates derived from source/event tables.
- Exact weight values and time windows (and how they should vary by entity type / location).

## Proposed End State (recommended)

### A. One selection system, two candidate pools

Treat “keyword candidates” as two pools that feed the same scheduled keyword collection budget:

1. **Entity-backed keywords** (existing entities)

- Selected via `EntityPrioritySelectionService` (with improved scoring + dedupe).

2. **Unmet-demand keywords** (on-demand terms)

- Selected via `OnDemandRequest` ranking (distinct users + recency + locationKey + reason).
- May or may not map to an existing entity id (unresolved terms often won’t).

This reduces the need for a fully separate “immediate on-demand” execution path while retaining the key signal: “users want something we can’t serve well yet”.

### B. Demand metrics become distinct-user based (by window)

Move demand metrics toward “how many unique users did this recently” rather than “how many total events happened”.

Recommended initial semantics (rolling window, e.g. last 30 days):

- `queryImpressions` ⇒ `COUNT(DISTINCT user_id)` in `user_search_logs` for searches where the entity was a target.
- `autocompleteSelections` ⇒ `COUNT(DISTINCT user_id)` of searches where:
  - `metadata.submissionSource = 'autocomplete'` AND
  - `metadata.submissionContext.selectedEntityId = entity_id` AND
  - (optional) selected entity type is non-restaurant (current behavior).
- `viewImpressions` ⇒ `COUNT(*)` of `user_restaurant_views` rows where `last_viewed_at` is within window (already distinct by user).
- `favoriteCount` ⇒ `COUNT(*)` rows in `user_favorites` (already distinct by user).

Key benefit: removes per-user rate-limiting complexity and makes the signal resistant to spam/retries.

### C. “Cached aggregates” are preferred over materialized views (for now)

Use `collection_entity_priority_metrics` as a **cached aggregate + computed score store** instead of only real-time counters.

Why:

- We still need writable fields like `lastSelectedAt`, `priorityScore`, and factor sub-scores.
- Prisma/Nest ergonomics are much better with a table than with managing a materialized view lifecycle.
- Postgres materialized views typically require full refreshes (and `CONCURRENTLY` has constraints); for multi-join/JSON-heavy queries this can be operationally noisy.

Materialized view remains an option later if we want DB-managed refreshes and we’re comfortable with refresh cost/locking characteristics.

## Implementation Plan (phased)

### Phase 0 — Baseline + guardrails (no behavior change)

1. Document current selection behavior and baseline metrics

- Log/track:
  - distribution of selected entity types,
  - distribution of entity `lastUpdated` ages among selected entities,
  - duplicate keyword rate by `LOWER(TRIM(entityName))`,
  - proportion of selected entities with zero app-demand counters.

2. Add a “dry run” mode for selection (optional)

- Ability to run priority selection and emit rankings without executing Reddit calls.

### Phase 1 — Fix recency inversion (behavior change, low risk)

1. Invert `calculateDataRecencyScore()`

- Change semantics to: **higher = more stale / needs refresh**.
- Update comments and any related logging fields so they match the new meaning.
- Validate against a few known entities:
  - recently updated entities should receive low recency scores,
  - very stale entities should receive high recency scores.

2. Re-check new-entity boost interaction

- Ensure the “newEntityBoost” doesn’t overwhelm the new stale-first approach (especially if “new” + “fresh” becomes a double advantage).

### Phase 2 — Deduplicate keyword strings (behavior change, moderate risk)

Goal: ensure we execute at most one keyword search per unique normalized keyword string per cycle.

1. Add dedupe-by-name to the **selection** stage (preferred)

- After scoring and sorting, build the output list by iterating from highest score downward:
  - normalize keyword: `name.trim().toLowerCase()` (optionally collapse whitespace)
  - keep first occurrence (highest score) per normalized name
  - continue until `maxEntities` unique names are collected
- This avoids returning fewer entities than desired.

2. Define normalization rules explicitly

- Minimum: trim + lowercase + collapse whitespace.
- Open item: strip punctuation / diacritics? (only if we see real duplicates like “tacos al pastor” vs “tacos-al-pastor”).

3. Add a safety dedupe in the orchestrator (optional but cheap)

- Dedup `entityNames` as a last line of defense so we never double-call Reddit for the same term.

### Phase 3 — Weight overhaul (behavior change, requires tuning)

1. Decide and encode new weights

- Top-level:
  - increase user demand weight (e.g., from 0.25 → 0.35–0.45),
  - decrease quality and/or recency accordingly (keeping recency inverted).
- Demand breakdown:
  - revisit connection-demand vs app-demand weights.
- App-demand sub-weights:
  - make `autocompleteSelections` and `viewImpressions` equal,
  - increase favorite weight,
  - reduce query-impression weight if needed to keep the sum at 1.

2. Make all weights configurable (no deploy needed to tune)

- Expand env-based config to include the top-level weights (recency/quality/demand) as well, not just demand subweights.

3. Validate weight changes with offline ranking snapshots

- Compare “before vs after” top-N keyword lists for a few locations.
- Sanity checks:
  - are we over-selecting newly updated entities?
  - are favorites making a visible difference?
  - are we overly biased to broad, noisy terms (“pizza”, “tacos”) vs specific high-intent terms?

### Phase 4 — Distinct-user demand metrics (architecture change)

This is the largest scaling/semantics change.

#### 4.1 Choose approach (recommended: offline aggregation into `EntityPriorityMetric`)

**Recommended:** stop treating `collection_entity_priority_metrics` as real-time counters and instead refresh it from source tables on a schedule (or immediately before selection).

Refresh inputs:

- `user_search_logs` for query + autocomplete-derived metrics
- `user_restaurant_views` for view metrics
- `user_favorites` for favorites

Refresh cadence options:

- before each keyword selection run (simple mental model)
- hourly (if keyword selection runs often)
- daily (if keyword selection runs daily)

#### 4.2 Implementation steps

1. Add an “EntityPriorityMetricsRefreshService”

- A single service that computes the rolling-window aggregates and upserts them into `collection_entity_priority_metrics`.
- Use bulk SQL via `prisma.$queryRaw` / `prisma.$executeRaw` for performance (avoid per-entity loops).

2. Remove dual-writes (behind a flag)

- Stop incrementing counters in:
  - `SearchService.recordQueryImpressions()` (query + autocomplete counters)
  - `HistoryService.recordRestaurantView()` (view counters)
  - `FavoritesService` / `FavoriteListsService` (favorite counters)
- Keep writing to source tables:
  - `user_search_logs`
  - `user_restaurant_views`
  - `user_favorites`

3. Update scoring to rely on refreshed aggregates

- `EntityPrioritySelectionService.calculateAppDemandScore()` reads cached aggregates.
- Define a clear window (e.g., last 30 days) and ensure it’s consistent across all app-demand signals.

4. Backfill and rollout

- Run a one-time refresh job to populate the metrics table.
- Roll out with a feature flag:
  - run refresh + compare “old counters vs refreshed counters” in logs for a week,
  - then disable real-time updates.

### Phase 5 — On-demand as a signal (distinct users + integration)

#### 5.1 Distinct-user on-demand counting

1. Add a distinct-user mechanism for on-demand

- Preferred schema shape (scale-friendly):
  - keep `OnDemandRequest` as the aggregate row,
  - add an `OnDemandRequestUser` join/log table with a unique constraint on `(requestId, userIdHash)` (or `(term, entityType, reason, locationKey, userIdHash)`).
- On record:
  - insert into join/log (dedupe per user),
  - update aggregate `distinctUserCount` and `lastSeenAt`.

2. Update gating logic

- Replace `occurrenceCount >= 3` with `distinctUserCount >= X` (likely `3` initially).

3. Decide retention

- Set a retention policy for per-user on-demand contribution rows (e.g., keep 30–90 days), or rotate hashed identifiers, to avoid unbounded growth.

#### 5.2 Feed on-demand into scheduled selection (Option B + C)

1. On-demand boost for existing entities (low-result)

- For `OnDemandRequest` rows with `reason='low_result'` and `entityId` present:
  - compute a boost term (e.g., normalize distinctUserCount / cap),
  - blend it into `userDemandScore` (either inside app demand or as its own sub-component).

2. Budgeted top-K unmet-demand keywords (unresolved + low-result)

- Per locationKey, select top-K on-demand terms (by distinct users + recency).
- Include them in the scheduled keyword search cycle as additional keywords, within a bounded budget.
- If the orchestrator requires `EntityPriorityScore[]`, represent on-demand-only keywords as “pseudo-entities” with:
  - `entityId = requestId` (or a sentinel),
  - `entityName = term`,
  - `entityType = group.type`,
  - a score derived from on-demand ranking.

#### 5.3 Consolidation decision (open)

Decide whether to:

- **Keep** immediate on-demand execution for “hot spikes” only (high distinct users in a short window), OR
- **Remove** immediate queueing and rely on more frequent scheduled keyword runs (daily or more) that already include top unmet-demand keywords.

This decision should be driven by:

- Reddit/API budget predictability,
- user experience impact of delay (hours vs up to a day),
- queue complexity/operational overhead.

## Testing & Validation

### Unit tests (recommended minimum)

- Recency scoring inversion tests:
  - increasing `daysSinceUpdate` should monotonically increase (or not decrease) the recency score.
- Dedupe behavior tests:
  - given duplicate names across entity types, output list contains one per normalized keyword and still reaches desired count (when enough candidates exist).
- Weight sanity tests:
  - ensure weight sums are 1 where expected; guard against negative weights.

### Integration / smoke tests

- Run keyword selection against a seeded DB snapshot (or staging) and confirm:
  - no duplicate `entityName` values in the keyword execution list per cycle,
  - stale entities now appear earlier,
  - high-intent signals (favorites/views/autocomplete) materially shift rankings.

### Observability

Add/confirm logging and metrics:

- selected keyword count, unique keyword count, deduped count
- distribution of `daysSinceUpdate` for selected keywords
- top contributors to score (recency vs quality vs demand)
- on-demand keyword inclusion rate + distinct-user counts
- Reddit API call counts per cycle (ensure budgets hold)

## Critical Notes / Recommendations (engineering perspective)

1. Consider making “staleness” an explicit concept (naming + semantics)

- The current `dataRecencyScore` name is now misleading once inverted. Consider renaming to `dataStalenessScore` (or clearly documenting “higher = needs refresh”) to avoid future regressions.

2. Don’t rely on a single scalar score to encode conflicting goals

- “Refresh stale data”, “follow demand”, “expand coverage”, and “avoid junk” often fight each other. A pragmatic pattern is to allocate a fixed budget per run (or per location) into slices, e.g.:
  - 50% stale refresh (high staleness + adequate quality),
  - 30% high-demand trending (high distinct users + recent),
  - 20% unmet demand (on-demand terms / low-result entities).
- This keeps behavior predictable and avoids weight‑tuning whack‑a‑mole.

3. Query-target counts are inherently “diluted” when searches resolve to multiple targets

- Even with distinct-user semantics, a broad query can boost many entities at once.
- If this becomes a problem, two common mitigations are:
  - count distinct `searchRequestId` instead of raw rows (already possible with `user_search_logs.searchRequestId`),
  - split credit per search across the number of targets (e.g., 1/N attribution), so broad searches don’t inflate everything equally.

4. Cached aggregates are the cleanest way to get distinct-user metrics without write-path complexity

- Storing per-entity user-hash sets in `collection_entity_priority_metrics` will grow unbounded and introduces concurrency hazards.
- A small join/log table for on-demand contributors is safer than arrays on the aggregate row.

5. If we remove immediate on-demand execution, keep a “hot spike” escape hatch

- A simple rule like “>= 25 distinct users in 24h” can trigger an earlier run for a term/location without reintroducing general unpredictability.
- This preserves UX responsiveness for genuinely trending terms while keeping the normal workload predictable.

6. Watch the performance profile of `EntityPrioritySelectionService`

- Today it loops all entities and makes multiple DB calls per entity (connections, metrics, etc.). If this starts to hurt:
  - restrict candidate sets per location first (scheduler already has a demand filter),
  - move scoring inputs to bulk queries / precomputed aggregates,
  - avoid per-entity connection queries where possible (compute quality/demand in one query per type).

## Open Questions / Decisions Needed

1. Weight values

- Exact new weights for:
  - recency vs quality vs demand,
  - connection-demand vs app-demand,
  - query vs autocomplete vs view vs favorites (and any on-demand boost).

2. Distinct-user semantics edge cases

- How to handle `userId = null` in `user_search_logs` (ignore, bucket, or infer)?
- Should `queryImpressions` represent distinct users or distinct searches (`searchRequestId`)?

3. Dedupe semantics

- Should dedupe consider entity `aliases` or only `name`?
- Do we need stronger normalization (punctuation/diacritics)?

4. On-demand consolidation

- Keep immediate on-demand for “hot spikes”, or remove it entirely once scheduled runs are daily?

5. Location segmentation

- Should demand metrics be computed per `locationKey` and used in scoring, or remain global and rely on scheduler filtering?

## References (code touchpoints)

- Priority scoring: `apps/api/src/modules/content-processing/reddit-collector/entity-priority-selection.service.ts`
- Scheduler: `apps/api/src/modules/content-processing/reddit-collector/keyword-search-scheduler.service.ts`
- Execution: `apps/api/src/modules/content-processing/reddit-collector/keyword-search-orchestrator.service.ts`
- Search logging + query impressions: `apps/api/src/modules/search/search.service.ts`
- Restaurant views: `apps/api/src/modules/history/history.service.ts`
- Favorites: `apps/api/src/modules/favorites/favorites.service.ts`, `apps/api/src/modules/favorites/favorite-lists.service.ts`
- On-demand requests: `apps/api/src/modules/search/on-demand-request.service.ts`
- On-demand execution: `apps/api/src/modules/search/on-demand-processing.service.ts`
- Schema: `apps/api/prisma/schema.prisma` (`SearchLog`, `RestaurantView`, `UserFavorite`, `EntityPriorityMetric`, `OnDemandRequest`)

---

## TEMP: Deep Dive Appendix (to integrate later)

This appendix expands on the decisions and contentious points from the discussion. It’s intentionally long and implementation-minded; we can fold the final decisions back into the main plan later.

### Decisions assumed in this appendix

- We are skipping unit/integration/smoke tests entirely.
- We will run scheduled keyword collection **daily** (instead of weekly) and remove “immediate on-demand execution” as a default path.
- We will keep a “hot spike” escape hatch for truly trending unmet-demand terms.
- All “demand” metrics will be interpreted as **distinct users** (not raw counts), and userId is assumed non-null in `user_search_logs`.
- We will use **cached aggregates** (table-backed) rather than a materialized view as the primary way to serve fast, distinct-user metrics into scoring.

---

### 1) Observability-first design (since we’re skipping tests)

The goal is to make keyword collection cycles debuggable and “tunable” via dashboards/log queries:

- Are we selecting the right keywords (and why)?
- Are cycles stable and predictable in cost (Reddit calls, processing time)?
- Are cycles producing useful outputs (posts, comments, connections created, new entities)?
- Are we wasting budget (duplicate terms, repeated no-results, terms too generic)?


#### 1.1 Principles

1. **Use Prometheus for low-cardinality health + SLOs; use Loki logs for high-cardinality details**

- Prometheus labels must not include `term`, `entityId`, or dynamic location identifiers unless the set is bounded (cardinality will explode).
- “Which terms were selected and how did each do?” belongs in structured logs (Loki) or a DB table, not as metric labels.

2. **Every cycle gets a durable correlation id**

- Use a `cycleId` (UUID) that appears in all logs from selection → scheduling → Reddit calls → processing.
- Also include `source` (scheduled/hot_spike), `coverageKey` (aka locationKey), and `subreddit`(s) searched.

3. **Emit one “cycle summary log event” and N “term summary log events”**

- The cycle summary is the dashboard-level “one row per run” record.
- Term logs are for drilldown and post-mortems.

#### 1.2 What to log (Loki) vs what to metric (Prometheus)

**Cycle summary log (one JSON log per cycle)**

Recommended fields:

- `event`: `keyword_cycle_summary`
- `cycleId`, `startedAt`, `finishedAt`, `durationMs`
- `coverageKey`, `subreddits: string[]`, `source: 'scheduled'|'hot_spike'`
- `selection`:
  - `totalKeywordsRequested`, `totalKeywordsSelected`, `totalKeywordsDedupedOut`
  - `sliceCounts`: `{ refresh: number, demand: number, unmet: number, explore: number }`
  - `entityTypeCounts`: `{ restaurant: n, food: n, food_attribute: n, restaurant_attribute: n }` (if available)
  - `stalenessDaysSummary`: `{ p50, p90, max }` for selected entities (entity-backed only)
  - `topReasons` (optional): e.g., “highFavorites”, “highViews”, “veryStale” counts
- `execution`:
  - `sortPlanUsed`: list of sorts/timeFilters executed
  - `redditApiCalls`, `redditRateLimitedCount` (if available)
- `results`:
  - `postsFound`, `commentsFound`, `uniquePosts`, `uniqueComments`
  - `connectionsCreated`, `entitiesCreatedOrEnriched`
- `failures`:
  - `failedTermsCount`, `failedCallsCount`
  - `errorKindsTop` (bucketed strings, not raw stack traces)

**Term summary log (one JSON log per term per cycle)**

Recommended fields:

- `event`: `keyword_term_summary`
- `cycleId`, `coverageKey`, `subreddit`, `term`, `termNormalized`
- `origin`: `{ slice: 'refresh'|'demand'|'unmet'|'explore', entityId?: string, entityType?: string, onDemandRequestId?: string }`
- `scores`: include only a few stable numbers (avoid huge blobs):
  - `stalenessScore`, `qualityScore`, `demandScore`, `unmetDemandScore` (as applicable)
  - `finalRankWithinSlice`, `finalRankOverall`
- `execution`: `sortsAttempted`, `apiCalls`, `durationMs`
- `results`: `posts`, `comments`, `connectionsCreated`, `success: boolean`
- `outcome`: `success|no_results|error|deferred` (unify across scheduled + unmet)

**Prometheus metrics (low-cardinality)**

We already have some keyword metrics in `KeywordSearchMetricsService`; the missing pieces are “cycle-level” and “selection-level” metrics. Suggested additions (names illustrative):

- `keyword_cycles_total{source, outcome}` counter
- `keyword_cycle_duration_seconds{source}` histogram
- `keyword_cycle_keywords_selected{source, slice}` histogram (bucketed counts)
- `keyword_cycle_keywords_deduped_total{source, reason}` counter (reason examples: `duplicate_term`, `cooldown`, `invalid_term`)
- `keyword_cycle_posts_total{source}` / `keyword_cycle_connections_created_total{source}` counters
- `keyword_cycle_reddit_api_calls_total{source}` counter
- `keyword_cycle_no_results_terms_total{source}` counter

Dashboard integration guidance:

- Add a new Grafana dashboard (or extend `observability/grafana/provisioning/dashboards/integrations-overview.json`) with panels for:
  - cycle success rate (last 24h / 7d)
  - p95 cycle duration
  - avg reddit API calls per cycle
  - posts/comments/connections created per cycle
  - % keywords deduped out
  - % terms with `no_results`
- Add Loki-based panels for drilldowns (top no-results terms, most frequent dedup collisions, etc.) using `event="keyword_term_summary"` filters.

#### 1.3 “Quality of selection” signals worth tracking

Because we’re changing scoring semantics and removing tests, the fastest way to detect “selection got weird” is to track distributions over time:

- Staleness distribution for selected entity-backed keywords (p50/p90/max age in days)
- Demand distribution (distinct users) for selected terms (by signal type)
- Keyword entropy / variety:
  - unique-term count per cycle,
  - number of repeated terms across adjacent days per location (requires storing last-run terms or deriving from logs)
- Outcome distributions:
  - share of keywords producing 0 results from Reddit (per slice)
  - share of keywords producing >0 connections created (true “value”)

---

### 2) What happens to the on-demand “no results” path?

If we remove immediate on-demand execution, “no results” does not go away — it simply moves to “scheduled unmet-demand attempts” (and should be treated as a first-class outcome).

#### 2.1 Why it matters

Without a “no results” backoff, daily runs can waste a large chunk of budget repeatedly searching terms that:

- are typos/noise,
- are too generic (“cheap”, “best”, “near me”),
- don’t exist in the target subreddit(s),
- exist but require different query strategy (synonyms, quotes, multi-word handling).

#### 2.2 Recommended behavior

1. **Keep recording unmet demand always**

- `distinctUserCount` continues to climb as more users fail to get results.

2. **Separate demand from eligibility**

- A term can have high demand but still be temporarily “ineligible” due to recent `no_results` attempts.
- Eligibility is controlled by cooldown/backoff.

3. **Use progressive widening + long cooldown for repeated no-results**

Suggested policy (example numbers; tune later):

- First attempt for an unmet-demand term (per location):
  - run with a “broad but bounded” plan (e.g., `new` + `top(year)` + `relevance(year)`), and search across the primary subreddit for that location.
- If `no_results`:
  - set `cooldownUntil = now + max(60 days, safeIntervalDays * 3)` (mirrors current on-demand logic).
- If demand continues to rise rapidly (hot spike), allow an override:
  - if `distinctUsersLast24h >= HOT_SPIKE_THRESHOLD`, ignore cooldown and re-attempt with broader scope (multiple subreddits for that coverageKey, or broader time filter).
- After `no_results` repeated N times (e.g., 2–3 attempts):
  - mark the term as “low yield” and require a higher hot-spike threshold to try again.

#### 2.3 Where to store the outcome (recommended)

Because we will run unmet-demand attempts from the scheduled pipeline, we need a place to persist:

- `lastAttemptAt`, `lastOutcome`, `cooldownUntil`, and optionally attempt counts.

Two reasonable options:

- Option A: keep these on `collection_on_demand_requests` (re-purpose it as a durable unmet-demand record store).
- Option B: introduce a small “keyword attempt history” table keyed by `(coverageKey, normalizedTerm)` and store outcomes for both entity-backed and unmet-demand terms.

If we want to unify “cooldowns” across all keywords (including entity-backed refresh keywords), Option B becomes very attractive. It also improves observability: “what did we search yesterday for Austin?” becomes a query, not a log scrape.

---

### 3) Replacing a single scalar score with a sliced, multi-objective selection

#### 3.1 Why the single scalar score fights us

We are optimizing multiple goals that can conflict:

- Refresh stale data (staleness-driven)
- Follow user demand (demand-driven)
- Improve coverage for gaps (unmet-demand-driven)
- Avoid junk / low-yield keywords (quality and no-results avoidance)

A single scalar score forces these to compete inside one “weight soup”, which usually leads to:

- endless retuning,
- brittle behavior changes,
- inability to guarantee a minimum amount of each goal is achieved every run.

#### 3.2 The sliced approach (ideal behavior)

Each daily cycle has a **fixed budget** of keywords (e.g., 25 terms per coverageKey). We allocate that budget into slices, each with its own ranking function:

- **Slice A: Refresh (staleness-driven)** — “keep high-value entities up to date”
- **Slice B: Demand (high-intent-driven)** — “follow what users are actively engaging with”
- **Slice C: Unmet Demand (coverage gaps)** — “people want it but we can’t serve it well yet”
- **Slice D: Explore (small)** — “prevent blind spots and discover emerging topics”

Then we merge slices in priority order with dedupe and cooldown rules.

This guarantees predictable behavior:

- even if demand explodes, we still refresh stale items,
- even if refresh candidates are huge, we still reserve space for gaps and demand,
- on-demand is “baked into the system” without separate queue machinery.

#### 3.3 Recommended daily slice budgets (starting point)

Assuming `TOTAL_TERMS_PER_CYCLE = 25` per coverageKey:

- Refresh: 10
- Demand: 8
- Unmet demand: 5
- Explore: 2

Rationale:

- Refresh is the “maintenance” backbone and should be the plurality.
- Demand is the primary UX driver and should be close behind.
- Unmet demand is crucial but needs bounded budget to avoid junk domination.
- Explore is intentionally small but non-zero (prevents stagnation).

If you want to simplify further, drop Explore and redistribute (+1 Refresh, +1 Unmet).

#### 3.4 Slice gating + scoring (concrete)

**Common gates (apply everywhere)**

- Term normalization + validity:
  - skip terms that normalize to empty, are too short, or match a stopword list (`best`, `good`, `near`, etc.).
- Cooldown gate:
  - don’t select a term if it was attempted recently for the same coverageKey (requires attempt history).
- Dedupe gate:
  - one normalized term per cycle (and ideally “recent cycles”) per coverageKey.

**Slice A: Refresh**

Goal: pick entity-backed keywords where the entity is stale enough that new collection is likely useful.

Inputs (entity-backed only):

- `stalenessDays` = `now - entity.lastUpdated`
- `qualityScore` (connection strength / mentions / upvotes)
- `demandScore` (see Slice B), optional as a tie-breaker

Recommended scoring:

- Hard gate: `stalenessDays >= 14` (or >= 30, depending on how quickly data changes)
- Score:
  - `refreshScore = stalenessScore * (0.6 + 0.4 * demandScore)`
  - where `stalenessScore` maps 0–120+ days into 0–1 with a curve that “saturates” (after a point, 200 days isn’t meaningfully different than 120).
- Apply quality as a guardrail:
  - either: require `qualityScore >= 0.2`
  - or: `refreshScore *= (0.5 + 0.5 * qualityScore)`

**Slice B: Demand (high-intent)**

Goal: pick keywords that represent what users actively want, favoring high-intent signals.

Unify the “equal view vs autocomplete” goal by treating them as the same conceptual signal:

- `highIntentUsers` =
  - for restaurants: distinct users who viewed the restaurant recently (`user_restaurant_views` windowed)
  - for non-restaurants: distinct users who selected the entity from autocomplete recently (derived from `user_search_logs` metadata)

Other demand signals:

- `queryUsers` = distinct users whose searches targeted this entity recently (`user_search_logs`)
- `favoriteUsers` = distinct users who favorited the entity (`user_favorites`) (not necessarily windowed; can be lifetime)

Recommended scoring weights (distinct users, normalized):

- `demandScore = 0.35 * favoriteSignal + 0.35 * highIntentSignal + 0.30 * querySignal`

Rationale:

- Favorites are the strongest “durable intent” signal.
- High-intent interaction (view/autocomplete select) is next strongest and should be equal-weighted across entity types.
- Query targets are valuable but noisier/diluted; keep them slightly lower.

Optional trending factor:

- multiply by a recency term based on last demand event time:
  - `demandScore *= (0.7 + 0.3 * exp(-daysSinceLastDemand / 14))`
  - so “hot right now” edges out “historically popular” without erasing it.

**Slice C: Unmet demand**

Goal: include gap-filling terms without requiring an “on-demand job runner”.

Inputs:

- `distinctUsers` on the request (by coverageKey + term)
- `reason` (`unresolved` vs `low_result`)
- `resultRestaurantCount/resultFoodCount` as severity signal (lower = worse)
- `lastOutcome` and `cooldownUntil` (for `no_results` backoff)

Recommended scoring:

- Gate: `distinctUsers >= 3` (initial), and `now >= cooldownUntil` if present.
- Severity:
  - `severity = unresolved ? 1.0 : 0.8` (unresolved is generally more urgent coverage-wise)
  - Optional: increase severity if `resultCounts` are near-zero.
- Score:
  - `unmetScore = severity * normalize(distinctUsers, cap=25) * recencyBoost * (1 - noResultsPenalty)`
  - `noResultsPenalty` could be 0.6–0.9 when lastOutcome was `no_results` recently.

Important: even without a separate top-K job, the slice itself still selects “top unmetScore” within its slice budget — that’s how we keep the cycle bounded.

**Slice D: Explore (optional)**

Goal: prevent the system from ignoring new or long-tail items forever.

Candidate sources:

- new entities with minimal connection data but growing demand
- rising on-demand terms just below thresholds

Scoring:

- prioritize “new + some intent” rather than “pure random”.

#### 3.5 Dedupe and tie-breaking across slices

Because the orchestrator ultimately searches by `term` (text), merging must prioritize unique terms and resolve collisions deterministically.

Recommended merge order (highest priority first):

1. Unmet demand (because it’s an explicit “we’re failing users” signal)
2. Refresh (data maintenance)
3. Demand (UX driver)
4. Explore

If a term is selected by multiple slices:

- keep the one from the higher-priority slice, and record a `dedupe_reason` metric/log entry.

---

### 4) Why “query-target demand” can be diluted (examples)

Even with distinct-user semantics, query-target signals can “over-credit” multiple entities at once because a single search may resolve to several entity targets.

#### Example A: broad search credits multiple targets equally

Assume the search UX resolves “pizza” into these targets:

- `pizza` (food)
- `italian` (food_attribute)
- `cheap` (restaurant_attribute) (if inferred)

100 distinct users search “pizza” in Austin.

If we count query-target distinct users per entity, we might get:

- `pizza`: 100 users
- `italian`: 100 users
- `cheap`: 100 users

But the user intent is primarily “pizza”, not “cheap”. In the extreme, “cheap” could get inflated across many queries (“cheap tacos”, “cheap ramen”, “cheap burgers”) and become a top keyword — which would be a terrible Reddit keyword to search.

This is “dilution”: the signal is spread (and sometimes amplified) across multiple targets that are not equally meaningful as keywords.

#### Example B: the dilution is not solved by deduping by name

Name dedupe solves “pizza (food)” vs “pizza (attribute)” duplicate _strings_.

But dilution also inflates _different strings_:

- “cheap” is not the same string as “pizza”.
- If “cheap” gets credited in many searches, it can steal keyword budget from more valuable terms.

#### Example C: how it distorts ranking

Suppose demand slice ranks by `queryUsers` heavily.

- `cheap` attribute appears in 40% of all searches (as an inferred modifier)
- `birria` food appears in 5% of searches (explicit, high intent)

Even if birria is a “perfect keyword” for enrichment, `cheap` may rank higher simply due to being a common modifier — and will likely yield noisy Reddit results.

#### Mitigations (choose one or combine)

1. **Lower query weight (as recommended)**

- Treat query-target demand as weak intent compared to favorites/views/autocomplete selections.

2. **Use “primary selection” attribution**

- When `submissionSource='autocomplete'` and `selectedEntityId` exists, grant full credit to that entity and partial credit (or zero) to inferred/secondary targets.
- This aligns credit with explicit user choice.

3. **Split credit across targets (1/N attribution)**

- If a search resolves to N targets, each target gets 1/N of the “query credit” for that search.
- This prevents one broad search from inflating many entities equally.

4. **Count distinct searches instead of distinct users (in specific cases)**

- Counting distinct `searchRequestId` helps dedupe retries, but it doesn’t fix multi-target dilution by itself; it’s mainly for idempotency and noise reduction.

---

### 5) Performance profile of `EntityPrioritySelectionService` (and low-hanging fruit)

#### 5.1 Why it can get expensive fast

`EntityPrioritySelectionService.selectTopPriorityEntities()` currently:

- loads _all entities_ by type,
- then for each entity performs multiple DB reads:
  - quality score reads connections (often many),
  - user demand reads top connections,
  - app demand reads entity priority metrics,
  - restaurants also read the entity itself.

This is effectively “N entities × several queries” which will scale poorly as entity count grows.

#### 5.2 Low-hanging performance wins (recommended order)

1. **Stop scoring “all entities”; score only candidates**

- For a location cycle, you already have a candidate list from demand (e.g., top 200–1000 entities by distinct users in that coverageKey).
- Pass candidate ids into the selection service and score only those.
- This usually yields a 10–100× reduction in DB work immediately.

2. **Batch-load metrics instead of per-entity reads**

- Replace per-entity `findById(entityId)` with a single `findMany(where: { entityId: { in: [...] } })` and map in memory.

3. **Replace per-entity connection queries with aggregate queries**

- Data quality and connection-demand inputs can be computed with grouped SQL once per type (or once per run), e.g. counts/sums grouped by `restaurant_id` / `food_id`, and `unnest(food_attributes)` for attribute entities.
- Even if we keep the same scoring math, doing it in bulk avoids N round-trips.

4. **Stop writing per-entity score rows during scoring**

- Today, selection writes `EntityPriorityMetric` for every scored entity (via `metricWrites`).
- With cached aggregates, write only what you truly need:
  - `lastSelectedAt` for chosen terms,
  - optional “top-N debug snapshot” records (better as logs).

5. **Move heavy scoring into the scheduler pipeline**

- The scheduler already starts with `SearchDemandService.getTopEntitiesForLocation(...)`.
- It’s simpler and faster to compute ranking _within that demand result set_ than compute a global ranking and intersect later.

#### 5.3 A practical “fast path” selection design

For each coverageKey daily:

- Fetch candidates: `topEntitiesForLocation` (distinct users windowed), limit maybe 500 per type.
- Fetch staleness (`lastUpdated`) for these entityIds in one query.
- Fetch cached metrics (`queryUsers`, `highIntentUsers`, `favoriteUsers`) in one query.
- Fetch quality aggregates in one grouped query (or from a cached quality table).
- Run slice selection in memory.

This avoids scanning the entire entity corpus and concentrates work where it matters.

---

### 6) LocationKey / coverageKey: current behavior + ideal handling

You’re right to call out location as “very important to get right” — it controls:

- which demand signals get grouped together,
- which subreddits we search,
- whether keyword collection helps the right users in the right region.

#### 6.1 Current behavior (from code)

1. Search logs (`user_search_logs.location_key`)

- `SearchService.resolveLocationKey()` uses `SearchSubredditResolverService.resolvePrimary()`.
- Under the hood, `CoverageKeyResolverService` selects a coverage area by:
  - choosing the smallest viewport that contains the search center, or else nearest.
  - returning `coverageKey` if present, otherwise `name`.
- If bounds exist and no match is found, `CoverageRegistryService.resolveOrCreateCoverage()` can create a `poll_only` coverage area and return a slug like `locality_region_country`.

2. Keyword scheduler

- Schedules are currently per “active subreddit” row (`coverageArea.name`, sourceType `all`).
- When calculating city demand, it resolves `coverageKey` for that subreddit (if present) and uses it as the demand query key.

3. On-demand execution (current system)

- On-demand attempts require a non-`global` locationKey.
- It maps `locationKey` → subreddit name(s) by looking up `coverageArea` rows with sourceType `all` where `coverageKey == locationKey` (or name matches if coverageKey match fails).

#### 6.2 Risks and failure modes with the current shape

1. **Key fragmentation (coverageKey vs name)**

- If some coverage areas have `coverageKey` and others don’t, the resolver will sometimes write `location_key = coverageKey` and sometimes `location_key = name`.
- That splits demand signals across two strings for the same “place” and makes selection less reliable.

2. **Poll-only coverage keys can capture demand without having a subreddit to search**

- If the resolver picks a `poll_only` record for a center (because it’s the smallest containing viewport), demand will be recorded under a key that has no sourceType `all` mapping.
- That demand would not influence keyword collection if we schedule only per subreddit.

3. **Multiple subreddits per coverageKey can duplicate scheduled work**

- The DB model allows multiple `coverageArea` rows with the same `coverageKey` (each row has a different `name`).
- Scheduling “per subreddit” can lead to multiple cycles targeting the same “city demand” key, but executing redundant or overlapping work.

#### 6.3 Recommended “ideal” approach given daily cycles + unmet-demand integration

**Principle: separate “location identity” from “execution targets”.**

- `coverageKey` (aka `locationKey`) should be the canonical identifier for “the place”.
- `subreddit` names are execution targets for Reddit search and may be one-to-many for a coverageKey.

Concretely:

1. **Standardize on always writing `location_key = coverageKey` (canonical)**

- Backfill/ensure `coverageArea.coverageKey` is populated for all `sourceType=all` rows.
- Make the resolver prefer `coverageKey` consistently.
- Continue to allow `poll_only` creation, but treat it as “coverageKey with possibly no subreddit mapping yet”.

2. **Schedule keyword collection by coverageKey (not by subreddit name)**

- Build the schedule set from distinct coverageKeys that are “collectable” (have at least one active `sourceType=all` mapping).
- For each coverageKey cycle, choose which subreddit(s) to execute against:
  - default: search only the primary subreddit (1 per cycle),
  - optionally: rotate through additional subreddits associated with the key over time.
- This removes duplicate cycles while preserving multi-subreddit coverage.

3. **Decide what to do with coverageKeys that have no subreddit mapping**

Options (pick explicitly):

- A) “Not collectable”: record demand but never run keyword collection; surface in dashboards as “coverageKey without subreddit mapping” so onboarding can add a subreddit or disable poll_only creation.
- B) “Nearest fallback”: map unknown coverageKey to the nearest collectable coverageKey for Reddit execution (but keep demand stored under the original key). This is simple but can blur regional intent.

4. **Use location-aware demand for selection**

- For each cycle, compute demand within that coverageKey (distinct users over a window) and use it as candidate generation and/or a demand input.
- This is more correct than “global priority intersect local demand after the fact”.

5. **Make the cooldown/backoff location-aware**

- Cooldowns for a term should be per `(coverageKey, normalizedTerm)` because Reddit results are location/subreddit dependent.

#### 6.4 Practical guidance for initial implementation

If we want the simplest path with minimal churn:

- Keep the scheduler loop “per coverageArea row” for now, but:
  - ensure it uses the resolved `coverageKey` (not raw `name`) consistently for demand,
  - ensure execution/search is aware of “coverageKey may map to multiple subreddits” (future step).
- In parallel, add observability that reports:
  - how often `location_key` equals `coverageKey` vs equals `name`,
  - how many `poll_only` coverageKeys appear in search logs,
  - how many coverageKeys have multiple active subreddits.

That instrumentation will tell us if consolidation-by-coverageKey is urgent or can wait.

---

### 7) Exact weight recommendations (in the sliced model)

In the sliced model, the most important “weights” are the slice budgets. Within each slice, we still need scoring weights.

#### 7.1 Slice budgets (exact starting point)

With `TOTAL_TERMS_PER_CYCLE = 25`:

- Refresh: 10
- Demand: 8
- Unmet demand: 5
- Explore: 2

If you want no Explore:

- Refresh: 11
- Demand: 8
- Unmet demand: 6

#### 7.2 Demand score weights (exact starting point)

All inputs are distinct-user counts, normalized with a log cap (same style as existing `normalizeLog`).

- `favoriteSignal` weight: **0.35**
- `highIntentSignal` weight: **0.35**
  - restaurants: distinct viewers in window
  - non-restaurants: distinct autocomplete selectors in window
- `querySignal` weight: **0.30**

Rationale:

- Matches your desire to equalize view vs autocomplete (both are “high intent”).
- Keeps query as meaningful but not dominant because of dilution risk.

#### 7.3 Refresh score weights (exact starting point)

- `refreshScore = stalenessScore * (0.6 + 0.4 * demandScore)`
- Apply quality guardrail:
  - gate `qualityScore >= 0.2` OR multiply by `(0.5 + 0.5 * qualityScore)`

Rationale:

- Refresh is primarily about staleness, but demand ensures we refresh what matters.
- Quality gating prevents wasting refresh budget on entities with weak foundations.

#### 7.4 Unmet demand score weights (exact starting point)

- `severity`:
  - unresolved: **1.0**
  - low_result: **0.8**
- `unmetScore = severity * normalize(distinctUsers, cap=25) * recencyBoost * cooldownPenalty`
- `recencyBoost = 0.7 + 0.3 * exp(-daysSinceLastSeen / 7)` (favors recently-seen gaps)
- `cooldownPenalty`:
  - if in cooldown: exclude
  - if lastOutcome=no_results within 60d: multiply by **0.3**

Rationale:

- Prioritizes widespread unmet demand (distinct users), keeps it fresh, and avoids repeated no-yield terms.

#### 7.5 Execution-plan weights (important for scaling)

Daily cadence does not mean “run every heavy sort every day”.

Recommended default for scheduled cycles:

- run `new` daily
- run `relevance` and `top` only every `max(safeIntervalDays * 3, 60 days)` for that coverageKey (mirrors current on-demand logic)

This keeps daily runs responsive while controlling API cost.
