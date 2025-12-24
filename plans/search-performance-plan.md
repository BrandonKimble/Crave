# Search Performance Plan (Natural Queries)

## Goals
- Reduce p95 latency for `POST /api/search/natural` and identify dominant phases.
- Preserve result correctness while deferring non-critical work.
- Add observability to attribute time to LLM, entity resolution, SQL, and post-processing.

## Constraints / Notes
- I cannot run direct `psql` commands in this environment (approval policy blocks it). The plan includes SQL you can run locally to confirm indexes and query plans.
- Use Redis where possible (already available in `LLMService`).

## Phase Timing (Instrumentation)
**Where to add**
- `SearchOrchestrationService.runNaturalQuery`: LLM analysis and entity resolution.
- `SearchService.runQuery`: query planning and post-processing.
- `SearchQueryExecutor.execute`: SQL build + DB query + open-now filtering + mapping.

**How to implement**
- Use `performance.now()` (from `perf_hooks`) to capture per-phase durations.
- Return a `phaseTimings` map (ms) in `response.metadata.analysisMetadata` or a new `metadata.phaseTimings` key gated behind an env flag (e.g., `SEARCH_INCLUDE_TIMINGS`).
- Log structured timings at `debug` and add Prometheus histograms for each phase (labels: format, openNow).

**Recommendation**
- Add timings first (low risk), then optimize the highest-cost phase.

## Optimization Ideas (Options + Recommendations)

### 1) LLM Analysis Caching
**Options**
- Redis TTL cache keyed by `{model, promptHash, normalizedQuery}`.
- In-memory LRU cache (per instance only).
- DB table cache (persistent, but heavier).

**Recommendation**
- Redis TTL cache (15–30 minutes) with a cache key that includes:
  - `llm.queryModel`
  - a hash of `queryPrompt + systemPrompt` (to bust cache on prompt updates)
  - normalized query (trim/lowercase)
- Store `LLMSearchQueryAnalysis` and a small metadata envelope (cachedAt, promptHash).
- Add negative caching for transient errors with short TTL (e.g., 30–60s) to avoid thundering herds.

### 2) Entity Resolution Caching
**Options**
- Redis cache per `(entityType, normalizedName, locationKey)` result.
- In-memory LRU cache layered on top for hot terms.
- Preload entire entity/alias lists into memory (heavy, stale risk).

**Recommendation**
- Two-tier cache:
  - LRU in-memory (short TTL, e.g., 2–5 min)
  - Redis TTL (10–30 min)
- Cache both positive and negative results (shorter TTL for negatives).
- Include resolution config in the key (fuzzy thresholds, allowEntityCreation).
- Track cache hit/miss metrics and log for high-traffic terms.

### 3) On-Demand Queue Decoupling
**Options**
- Fire-and-forget `enqueueRequests` after response (fast, but can drop on crash).
- Queue a lightweight background job to handle enqueueing (more reliable).
- Outbox table + worker (most reliable, more work).

**Recommendation**
- Keep `recordRequests` synchronous (already DB-backed).
- Move `enqueueRequests` to a background Bull job:
  - `on-demand-enqueue` job reads pending records and enqueues.
  - Response sets `onDemandQueued` to `true` once requests are recorded; use `estimateQueueDelayMs()` for ETA.
- Add a small retry policy to the enqueue job.

### 4) Open-Now Post-Processing Cost
**Options**
- Cache `openNow` evaluation per location with TTL.
- Precompute `openNow` in DB via scheduled job + store next-change timestamp.
- Push open-now filtering into SQL (complex with hours JSON).
- Early-exit filtering once enough results found.

**Recommendation**
- Short-term: add a per-location `openNow` cache in Redis (TTL ~5–10 min or until next open/close boundary if computed).
- Add early-exit in JS: stop evaluating once you’ve collected enough results for the requested page (use `openNowFetchMultiplier` as a hard cap).
- Longer-term: consider a scheduled job that computes `open_now` and `next_change_at` fields on `core_restaurant_locations` and filter in SQL.

### 5) SQL + Indexes
**What to inspect**
- Generated SQL in `SearchQueryBuilder` (CTEs: `filtered_restaurants`, `filtered_locations`, `filtered_connections`).
- Joins on `core_entities`, `core_connections`, `core_restaurant_locations`, `core_display_rank_scores`.

**Likely index candidates (validate with EXPLAIN)**
- `core_entities`: `(type)`, `(entity_id)` (PK), `(location_key)`, GIN on `restaurant_attributes`.
- `core_connections`: `(restaurant_id)`, `(food_id)`, GIN on `categories`, GIN on `food_attributes`, `(total_upvotes)` if filtering by votes.
- `core_restaurant_locations`: `(restaurant_id)`, `(latitude, longitude)` if bounding queries, partial index for `google_place_id IS NOT NULL AND address IS NOT NULL`.
- `core_display_rank_scores`: composite `(subject_type, subject_id, location_key)`.

**Recommendation**
- Run `EXPLAIN (ANALYZE, BUFFERS)` on representative queries and add only the indexes that change the plan.

## Proposed Execution Order
1) Add phase timing instrumentation and logging.
2) Add Redis cache for LLM analysis.
3) Add two-tier cache for entity resolution results.
4) Decouple on-demand enqueue into background job.
5) Add open-now caching + early-exit logic.
6) Run SQL EXPLAIN and add targeted indexes.

## Validation & Rollout
- Compare p50/p95 latency before/after in metrics.
- Track cache hit rates and LLM request volume.
- Confirm response correctness with a small A/B test (cache on/off).

## Suggested DB Analysis Commands (run locally)
```sql
EXPLAIN (ANALYZE, BUFFERS)
WITH ... -- paste SQL preview from SearchQueryBuilder
SELECT * FROM filtered_connections fc ORDER BY ... OFFSET ... LIMIT ...;
```
