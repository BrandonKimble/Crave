# Keyword Collection Priority Overhaul (Daily Slices + Distinct Users + Cached Aggregates)

## Implementation Handoff (for a new agent/session)

If you are picking this up in a fresh chat: treat this plan as the source of truth and implement it end-to-end.

- Read `plans/keyword-collection-priority-overhaul.md` and `plans/keyword-collection-observability-overhaul.md` first.
- Follow all “Decisions (Locked)” exactly; do not re-open them unless a real blocker appears.
- We are intentionally skipping unit/integration/smoke tests; rely on the “Minimum Observability Safety Net” + manual validation steps.
- Data is non-production/test-only: prefer the simplest cutover (truncate/backfill) and aggressively delete legacy fields/code once replaced.
- Make schema changes via Prisma migrations and update all call sites (scheduler, demand service, search logging, on-demand).
- Keep scope tight: implement only what this plan requires.

## Summary

Keyword collection currently selects entities via `EntityPrioritySelectionService.selectTopPriorityEntities()` and then searches Reddit using **entity name text only**. This overhaul makes keyword selection:

- **Daily** (scheduled), with a small “hot spike” escape hatch (not a general on-demand queue).
- **Multi-objective** via a **slice model** (Refresh / Demand / Unmet / Explore) instead of a single scalar score.
- **Spam-resistant** by interpreting demand metrics as **distinct users in a rolling window** (not raw counts).
- **Predictable** by using a per-cycle **term budget** with **dynamic underfill + reallocation**.
- **Efficient** by using candidate pools per slice (avoid scoring “all entities”).
- **Correct** about keyword strings by normalizing + deduping terms before execution.

This plan also:

- fixes the recency inversion (fresh currently scores higher; we want stale),
- standardizes how “generic” query tokens (e.g., `best`) behave (shortcuts for UI, never keywords),
- integrates on-demand as a signal (unmet-demand slice) while deleting the legacy “immediate on-demand execution” code/fields,
- introduces a unified `keyword_attempt_history` table for cooldowns and outcomes across all slices.

Observability is split:

- This plan ships a **minimum safety net** (cycleId + summary logs + a few low-cardinality metrics).
- The full cohesive observability work is tracked in `plans/keyword-collection-observability-overhaul.md`.

## Goals / Non-Goals

### Goals

- Select “perfect keywords” for collection:
  - high user value (distinct users engaging),
  - high expected yield (not generic/junk),
  - stale enough to be worth refreshing,
  - includes unmet demand signals without unpredictable load.
- Ensure one cycle executes **unique terms** (no duplicate string searches like `pizza` twice).
- Make the system tunable and safe without tests (via logs/metrics/dashboards).
- Remove legacy on-demand queue and legacy counters once replaced (no dead code paths).

### Non-Goals

- Poll topic selection design (we will only preserve poll-only demand correctly for later use).
- Building unit/integration/smoke tests (explicitly skipped).
- Rewriting the Reddit ingestion pipeline beyond what keyword selection/execution needs.

## Decisions (Locked)

- Run scheduled keyword collection **daily**.
- Remove “immediate on-demand execution” as a default path; keep a **hot spike** escape hatch only.
- Move from a single scalar score to a **sliced selection** model.
- Use **distinct users in a rolling window** for all demand metrics (query, view, autocomplete selection, favorites, unmet demand).
- Use **cached aggregates** (table-backed) rather than a materialized view.
- Add a unified **keyword attempt history** table keyed by `(collectionCoverageKey, normalizedTerm)` and use it for:
  - cooldowns/backoff,
  - “no_results” suppression,
  - staleness (“when did we last try this keyword here?”).
- Record **food/dish views** when a user taps a dish card (opens a restaurant profile from a dish result) and use those as the primary high-intent signal for `food` entities.
- Implement **term normalization + stopword behavior**:
  - “best” (and other generic tokens) are never keyword candidates,
  - generic tokens are ignored in LLM analysis and all downstream processing,
  - generic-only queries route to existing “shortcut” flows.
- Implement **demand attribution that prefers the most specific / explicitly selected term** (avoid fallback-chain dilution).
- Delete legacy fields and code once migrated (no “stop using it but keep it around”).

## Core Concepts / Glossary

- `normalizedTerm`: canonical keyword string used for dedupe/cooldowns (trim/lowercase/collapse whitespace; optional punctuation rules).
- `uiCoverageKey`: where the user is “in the UI” (can be `poll_only` coverage).
- `collectionCoverageKey`: where we can actually execute Reddit collection (must map to at least one active subreddit).
- `cycleId`: correlation id for a single keyword collection cycle.
- “Distinct users” means **in-window distinct users** (e.g., last 30 days), not all-time. This is how the system “resets” and can detect trends.

## Why We’re Moving Away From a Single Scalar Score

We are simultaneously trying to:

- refresh stale data,
- follow user demand,
- fill coverage gaps (unmet demand),
- explore long-tail / emerging interests,
- avoid wasting calls on junk/no-results.

A single score (“weight soup”) makes these objectives fight and causes brittle tuning. Slices let us guarantee minimum behavior per goal and measure yield per slice.

## Target Architecture (End State)

### 1) Daily cycles, budgeted by terms (dynamic effective budget)

Each **collectionCoverageKey** runs a daily cycle with:

- a configured **max term budget** (starting point: `25`),
- slice quotas (starting point below),
- a shared dedupe/cooldown filter,
- **dynamic underfill + reallocation**.

#### Dynamic effective budget (what it means)

We do **not** require a global daily Reddit budget to get “dynamic budget behavior”.

Instead:

- We set a per-cycle maximum (e.g., 25).
- Each slice has a target quota.
- If a slice can’t fill its quota (too few eligible candidates due to cooldowns/stopwords/low quality), it **underfills**.
- The leftover slots are **reallocated** to other slices using their overflow candidates.

Concrete example (max=25, quotas 10/8/5/2):

- Unmet slice only finds 2 eligible terms (others are in cooldown or generic).
- We select those 2, and the remaining 3 unmet slots are reallocated:
  - first to Refresh overflow (stale terms),
  - then Demand overflow,
  - then Explore overflow (if we choose).
- Final executed term count may still be <25 if all slices are weak (that’s desirable).

### 2) Slice model (behavior guarantees)

Each cycle selects terms from these slices, each with its own candidate source + scoring:

1. **Unmet** (coverage gaps): terms users want but search can’t serve well.
2. **Refresh** (maintenance): entity-backed keywords we haven’t attempted recently for this coverageKey.
3. **Demand** (high intent): what users explicitly engage with.
4. **Explore** (small, intentional): novel + real signal (long-tail, minority preferences, emerging trends).

### 3) Unified term attempt history (cooldowns + staleness)

Introduce `keyword_attempt_history` keyed by:

- `collectionCoverageKey`
- `normalizedTerm`

Store:

- `lastAttemptAt`, `lastSuccessAt`
- `lastOutcome` (`success|no_results|error|deferred`)
- `cooldownUntil`
- attempt counters (optional)
- execution context summary (optional; keep small)

This table becomes the single source of truth for:

- “don’t retry too soon” (cooldown),
- “this term repeatedly yields nothing” (no_results backoff),
- refresh staleness (days since last successful attempt).

#### Attempt outcome policy (v1 constants)

We will use the same attempt history for all slices, but set outcome-based cooldowns so daily cycles don’t re-run the same keywords excessively.

- `success`:
  - `cooldownUntil = now + 7 days`
- `no_results`:
  - `cooldownUntil = now + max(60 days, safeIntervalDays * 3)` (per coverageKey)
- `error`:
  - `cooldownUntil = now + 1 day` (short backoff; prevents tight retry loops)
- `deferred` (e.g., skipped due to budget/time/rate-limit):
  - `cooldownUntil = now + 6 hours`

Hot-spike runs may override cooldown (see “hot spike” thresholds below).

### 4) Distinct-user demand everywhere (windowed)

All event-based “demand” signals are interpreted as **count of distinct users in a window** (e.g., last 30d), not raw counts:

- query demand (from `user_search_logs`)
- high-intent demand (views / explicit selections)
- unmet-demand (from on-demand terms)

`favoriteUsers` is still “distinct users” but is naturally distinct already (one favorite per user) and can be treated as the current active count; we can add a “recent favorites” window later if we want more recency.

This addresses the “will it never reset?” concern:

- If demand is measured over the last 30 days, old users/actions roll off naturally.
- Trending can be captured via 7d vs prior 7d deltas (Explore slice).

Window defaults (v1):

- `demandWindowDays = 30` (used for windowed cached aggregates like query/high-intent/unmet demand)
- `trendWindowDays = 7` (used for Explore “trend”)
- `hotSpikeWindowHours = 24` (used for hot spike scheduling)

All windows should be env-configurable; `30d` is intentionally “stable enough” for low-traffic coverageKeys while still being bounded (not all-time).

### 5) Cached aggregates (table-backed) instead of real-time counters

We keep `collection_entity_priority_metrics` but repurpose it as “cached aggregates and selection metadata”, refreshed from source/event tables.

Why not a materialized view (for now):

- We need writable per-entity fields like `lastSelectedAt`.
- Materialized view refresh behavior can be operationally noisy (especially with JSON parsing and multi-joins).
- Prisma/Nest ergonomics are better with a table we control.

### 6) Term normalization + stopwords + shortcuts

We will maintain one shared “generic token list” used in:

- search query normalization (before LLM),
- on-demand term normalization,
- keyword candidate eligibility,
- downstream LLM/analysis (filter out these tokens).

#### Generic tokens list (v1)

The intent is to strip tokens that do not change the underlying search semantics for Crave (they mostly mean “rank it” or “location context” which we already have).

Initial list (single tokens and short phrases):

- rank words: `best`, `top`, `good`, `great`, `favorite`, `favourite`, `popular`
- location filler: `near`, `nearby`, `around`, `closest`, `close`
- “generic object” words (only when the query is otherwise empty): `food`, `dish`, `dishes`, `restaurant`, `restaurants`, `place`, `places`

Rules:

- Strip rank/location filler tokens anywhere in the query (conservatively: whole-word matches).
- Strip “generic object” tokens only if they are the entire remaining query after other stripping (we do not want to delete “food” inside real phrases).

#### Shortcut routing (v1)

If the query becomes empty after stripping:

- default shortcut uses the current UI tab:
  - dishes tab → “Best dishes here”
  - restaurants tab → “Best restaurants here”
- if the UI tab is unavailable (server-only context), default to “Best dishes here”.

#### Behavior guarantees

These apply across the system:

- Generic tokens never become keyword candidates.
- The same generic list is not considered by LLM analysis or downstream entity targeting (e.g., “best ramen” is treated as “ramen”).

#### Examples

- `"best ramen"` → normalized query `"ramen"`; only `"ramen"` participates in entity resolution, logging, on-demand, and keyword candidacy.
- `"best"` (generic-only) → route to shortcut behavior and do **not** generate keyword/on-demand artifacts.
- Any candidate term that normalizes to a generic token (or generic-only phrase) is **ineligible** for keyword collection.

#### Term normalization (v1)

- For `normalizedTerm` (dedupe/cooldowns):
  - `trim`, `lowercase`, collapse whitespace.
  - strip punctuation to spaces (e.g., `tacos-al-pastor` → `tacos al pastor`).
  - strip diacritics via unicode normalization (e.g., `phở` → `pho`) to prevent accidental duplicates and improve Reddit matching.
- For execution term:
  - prefer the original display term (for readability), but allow the executor to use an ASCII-fallback form when diacritics are present.
- Do **not** generate extra keyword candidates from `entity.aliases` in v1 (keep candidate surfaces small and predictable). Aliases can be used later as “execution variants” if we see poor recall.

### 7) Demand attribution: prefer explicit/most-specific (prevent dilution)

The LLM prompt explicitly encourages fallback chains (e.g., `["spicy tuna roll","tuna roll","roll"]`). If we credit all resolved targets equally, generic fallbacks can dominate.

Decision: for demand metrics used for keyword selection, attribute primarily to:

- the explicitly selected entity (when `submissionContext.selectedEntityId` exists), else
- the most specific term/target (primary attribution) rather than all fallbacks.

This preserves fallback chains for retrieval quality while preventing them from poisoning keyword selection.

### 8) Location: separate “UI identity” from “collection execution”

Today `user_search_logs.location_key` can be either:

- a `coverageKey` (when created via `poll_only` coverage), or
- a `coverageArea.name` (often a subreddit name).

This fragments demand and can route demand into buckets we cannot execute.

Decision: adopt a “dual key” model:

- `uiCoverageKey`: where the user is (can be poll_only; used for polls and UI-level analytics).
- `collectionCoverageKey`: where collection can execute (must map to at least one active subreddit).

We will keep poll-only demand for poll topics and future onboarding, without forcing it to “leak” into other areas for keyword collection.

Practical flow (high level):

1. User searches with bounds/user location.
2. We resolve `uiCoverageKey` (smallest containing coverage; can be poll_only).
3. We resolve `collectionCoverageKey` (nearest/containing **collectable** coverage).
4. Search logging and keyword-collection demand use `collectionCoverageKey`.
5. Poll demand analytics use `uiCoverageKey`.
6. If `uiCoverageKey` has no `collectionCoverageKey`, we can still accumulate poll-topic demand and later attach a subreddit mapping without losing history.

#### Concrete storage decision (v1)

We will store both keys in `user_search_logs` so demand can be used by both poll-topic generation and keyword collection:

- Keep `user_search_logs.location_key` as `uiCoverageKey` (preserves current poll behavior and poll-only demand).
- Add `user_search_logs.collection_coverage_key` as `collectionCoverageKey` (used by keyword collection + collection-demand queries).

Then:

- PollScheduler continues to use UI keys (poll-only supported).
- Keyword collection uses collection keys (collectable-only).

This prevents poll-only demand from “leaking” into other areas while still preserving the data for polls and potential future subreddit onboarding.

## Recommended Starting Numbers (Budgets + Weights)

These are starting points meant to be tuned with observability.

### 1) Term budget per cycle

Start with:

- `MAX_TERMS_PER_CYCLE_PER_COVERAGE_KEY = 25`

Operational scaling guidance (without a global cap):

- Keep the max at 25 but allow cycles to underfill.
- Optionally skip cycles for low-activity coverageKeys (e.g., if demand < threshold in last 30d).
- Keep heavy sorts (top/relevance) on a slow cadence (see execution plan below).

### 2) Slice quotas (starting point)

For `MAX_TERMS_PER_CYCLE = 25`:

- Unmet: 5
- Refresh: 10
- Demand: 8
- Explore: 2

Reallocation order (when slices underfill):

1. Unmet overflow (if eligible)
2. Refresh overflow
3. Demand overflow
4. Explore overflow

### 3) Demand scoring weights (distinct users, windowed)

We separate “query-target demand” (noisy) from two higher-intent tiers:

- **explicit selection** (user deliberately chose a specific entity from autocomplete/recents)
- **card engagement** (user deliberately chose a concrete result card)

Define, per term/entity in a coverageKey:

- `favoriteUsers` (distinct users who favorited)
- `explicitSelectionUsers` (distinct users who explicitly selected the entity from autocomplete/recents in window)
- `cardEngagementUsers`:
  - restaurants: distinct users who opened a restaurant profile via result-card/map selection in window (**exclude** profile opens triggered by autocomplete selection)
  - foods: distinct users who tapped a dish card (recorded as a food view) in window
  - attributes: N/A (0)
- `queryUsersPrimary` (distinct users whose searches primarily attributed to this term/target)

Normalize each with a log-style cap (diminishing returns).

Normalization (v1):

- `normalizeLog(x, cap) = clamp01( ln(1 + x) / ln(1 + cap) )`

Caps (v1):

- `favoriteUsersCap = 10`
- `cardEngagementUsersCap = 25`
- `explicitSelectionUsersCap = 25`
- `queryUsersPrimaryCap = 50`

Starting weights inside the Demand slice:

- favorites: **0.35**
- card engagement: **0.20**
- explicit selection: **0.15**
- query-primary: **0.30**

Rationale:

- Card engagement is the strongest non-favorite signal (user chose a concrete result).
- Explicit selection is a strong “I meant this” signal, but weaker than post-result engagement.
- Query-primary is meaningful but intentionally not dominant due to dilution risk.

### 4) Refresh scoring (staleness-driven)

Refresh should be based on **term attempt staleness**, not `entity.lastUpdated` (entity updates can happen for unrelated reasons).

Inputs:

- `daysSinceLastSuccessAttempt` for `(coverageKey, normalizedTerm)` from attempt history
- `qualityScore` as a guardrail (avoid junk/ghost entities)
- optional `demandScore` as a tie-breaker

Starting formula:

- `stalenessScore = saturatingCurve(daysSinceLastSuccessAttempt)` (0–1)
- `refreshScore = stalenessScore * (0.6 + 0.4 * demandScore)`
- apply quality guardrail:
  - either hard gate `qualityScore >= 0.2`, or
  - multiply `refreshScore *= (0.5 + 0.5 * qualityScore)`

### 5) Unmet scoring (distinct users + severity + recency + cooldown)

Inputs:

- `distinctUsersWindowed` for the unmet-demand term (per coverageKey)
- `reason`:
  - `unresolved` severity 1.0
  - `low_result` severity 0.8
- `daysSinceLastSeen` (recency boost)
- attempt-history cooldown/backoff (exclude if in cooldown)

Starting formula:

- `unmetScore = severity * normalize(distinctUsers, cap=25) * recencyBoost * cooldownPenalty`
- `recencyBoost = 0.7 + 0.3 * exp(-daysSinceLastSeen / 7)`
- `cooldownPenalty`:
  - if in cooldown: exclude
  - if lastOutcome=`no_results` within 60d: multiply by 0.3 (soft suppression)

### 6) Explore scoring (novel + real signal; no forced diversity)

Explore’s purpose is not randomness; it’s “discoverable long-tail”.

Candidate pool (per coverageKey):

- terms/entities with some real signal but not already top-of-demand:
  - mid-tail `highIntentUsers` or `favoriteUsers`,
  - rising unmet-demand terms below the unmet gate,
  - locally-specialized terms (more popular here than globally).

Scoring components (all 0–1):

- `novelty`: 1.0 if not attempted recently; decays if selected in last N days (attempt history)
- `localSpecialization`: `min(1, (localQueryUsers+1)/(globalQueryUsers+1) / 3)` (cap at 3× local-over-global)
- `trend`: compare last 7d vs prior 7d distinct users: `trend = clamp01((u7 - uPrev7) / max(1,uPrev7))`
- `signalFloor`: require `highIntentUsers >= 2` OR `favoriteUsers >= 1` OR `unmetDistinctUsers >= 2` (avoid pure noise)

Starting formula:

- `exploreScore = 0.45*novelty + 0.35*localSpecialization + 0.20*trend`
- gate by `signalFloor` (if not met, exclude)

No forced diversity:

- Explore terms must be “worthy” by score/gates; we do not force distribution across cuisines/attributes.

### 7) Execution plan cadence (scaling without a global budget)

Daily cadence does not mean “run every heavy sort daily”.

Starting policy per coverageKey:

- Always run `new` daily.
- Run `top` and `relevance` on a slower cadence:
  - only if `now - lastTopRelevanceRun >= max(safeIntervalDays*3, 60 days)`
  - or for hot-spike override attempts.

This keeps daily runs responsive while controlling API cost.

## Implementation Plan (Phased)

### Phase 0 — Minimum safety net (observability + baselines)

1. Add cycleId propagation + cycle summary logs

- Add `cycleId` to logs across scheduler → selection → orchestrator → processing.
- Emit:
  - one `keyword_cycle_summary` log per cycle,
  - one `keyword_term_summary` log per term attempt.
- Full observability work is in `plans/keyword-collection-observability-overhaul.md`.

2. Baseline measurements (before behavior change)

- Duplicate term rate (by `normalizedTerm`) in current selection.
- Distribution of term ages (attempt-history doesn’t exist yet; use entity lastUpdated as temporary proxy).
- No-results rate by term (from current on-demand outcomes + keyword metrics).

### Phase 0.5 — Quick wins in the current pipeline (small, immediate fixes)

These are safe, incremental fixes we should do even before the larger slice/cached-aggregate migration lands.

1. Fix the recency inversion in `EntityPrioritySelectionService` (if it remains in use during rollout)

- Invert the meaning so **stale entities score higher** (or rename to `stalenessScore`).
- This prevents “just enriched yesterday” entities from dominating selection while we build the new slice system.

2. Add term normalization + dedupe as a last line of defense in the orchestrator

- Even after slice-level dedupe, ensure we never execute the same `normalizedTerm` twice in one cycle.
- Add `KEYWORD_COLLECTION_DRY_RUN=true`:
  - selection runs + logs/metrics emit,
  - no Reddit calls,
  - no attempt-history writes (so dry runs can’t block real execution).

### Phase 1 — Data model changes (attempt history + distinct unmet demand)

1. Add `keyword_attempt_history` table

- Key: `(collectionCoverageKey, normalizedTerm)`
- Fields described in Target Architecture.
- This table must be used by both entity-backed and unmet-demand term attempts.

2. Convert on-demand demand counting to distinct users (windowed)

- Replace `occurrenceCount` semantics with a join/log table:
  - `on_demand_request_users(requestId, userId, createdAt)` with unique constraint.
- `OnDemandRequest` becomes an aggregate with:
  - `distinctUserCount` (optionally windowed rollups),
  - `lastSeenAt`, `reason`, `result counts`, and location keys.

Retention (v1):

- Keep `on_demand_request_users` rows for **90 days**.
- Add a daily cleanup job to delete older rows (keeps growth bounded).

3. Delete legacy on-demand execution columns (after migration)

- Remove fields on `collection_on_demand_requests` that belong to the old queue:
  - `status`, `lastEnqueuedAt`, `attemptedSubreddits`, `deferredAttempts`, `lastOutcome`, `lastAttemptAt`, `lastCompletedAt`, etc.
- All attempt outcomes move to `keyword_attempt_history`.

4. Add `user_food_views` (dish views) for high-intent food signals

- Add `FoodView` table keyed by `(userId, connectionId)` (dish-at-restaurant), with `foodId` denormalized for aggregation.
  - This supports multiple history entries like “ramen @ Tatsuya” and “ramen @ Ichiban” (same `foodId`, different `connectionId`).
- Add API endpoint to record a food view (no UI required now; used for demand only).
- Update mobile `DishResultCard` press handling to record a food view for `item.connectionId` (and optionally `item.foodId`) (async, fire-and-forget).

### Phase 2 — Query normalization + stopwords (search + LLM + downstream)

1. Implement shared “generic token handling”

- Strip generic tokens/phrases before LLM analysis and entity resolution.
- Ensure the same list is used by:
  - on-demand term recording,
  - keyword candidate eligibility,
  - any downstream analysis.

2. Generic-only query classification

- If the remaining query is empty after stripping, route to existing shortcut flows.
- Do not create unmet-demand requests or keyword demand artifacts for generic-only queries.

### Phase 3 — Cached aggregates refresh (distinct users) + remove real-time counters

1. Add a refresh job/service that computes windowed distinct-user metrics

Sources:

- `user_search_logs` for query-primary demand and explicit selection events
- `user_restaurant_views` for view demand
- `user_food_views` for dish-card food views (high-intent for `food`)
- `user_favorites` for favorites demand

Notes:

- `user_search_logs.user_id` is currently nullable, but app behavior should ensure it’s always set (all users are logged in). Treat null as a bug; filter nulls out of distinct-user aggregations.

2. Update `collection_entity_priority_metrics` semantics

- Keep columns but change meaning: values represent “distinct users in window” (not lifetime raw increments).
- Ensure merges (`restaurant-entity-merge.service.ts`) remain correct (may need to switch to max/merge-by-window instead of sum).

Rollout (v1; simple because data is non-production):

- No feature flags or compare mode required.
- Run a one-time backfill (or truncate + repopulate) of the metrics table after the refresh job exists.
- Remove real-time counter writes immediately after cutover.

3. Remove dual-write paths (delete legacy code)

- Delete or disable direct real-time increments in:
  - `SearchService.recordQueryImpressions()` (query + autocomplete counters),
  - `HistoryService` view counter updates,
  - favorites counter updates,
  - any other counter write path.

### Phase 4 — Sliced selection + term dedupe + cooldown integration

1. Implement per-slice candidate generation

- Each slice has its own candidate source (no global “top list” that would constrain the system):
  - Unmet: on-demand terms (distinct users + severity + recency)
  - Refresh: stale attempt-history terms (plus guardrails)
  - Demand: high intent/favorites/query-primary per coverageKey
  - Explore: novelty/trend/specialization candidates

2. Implement merge, dedupe, and tie-breaking

- Dedupe by `normalizedTerm` across all slices.
- Tie-break by fixed priority order:
  - Unmet > Refresh > Demand > Explore
- Record dedupe reasons in logs/metrics (so we can tune quotas).

3. Implement dynamic underfill + reallocation

- Underfilled slice quotas are redistributed to other slices’ overflow candidates.

### Phase 5 — Scheduler changes (daily; on-demand removed; hot spike only)

1. Move scheduler cadence to daily

- Replace weekly cadence with daily cycle orchestration.
- Ensure `top/relevance` are still cadence-limited via safe intervals.

2. Remove immediate on-demand processing

- Delete `OnDemandProcessingService` enqueue/queue loop as a default path.
- Keep a minimal hot spike mechanism that schedules an early attempt for a term if its distinct-user demand spikes within 24h.

Hot spike thresholds (v1):

- Trigger a hot-spike attempt if `distinctUsersLast24h >= 25` for `(collectionCoverageKey, normalizedTerm)`.
- Additionally trigger if `distinctUsersLast24h >= 10` AND `distinctUsersLast24h >= 3x distinctUsersPrev24h` (trend-based override).

### Phase 6 — Location correctness (uiCoverageKey vs collectionCoverageKey)

1. Implement dual-key resolution

- Resolve `uiCoverageKey` using the existing smallest-containing logic (can include poll_only).
- Resolve `collectionCoverageKey` using only collectable coverage areas (sourceType `all` with active subreddit mapping).

2. Logging + demand aggregation changes

- Search logging writes both:
  - `uiCoverageKey` → `user_search_logs.location_key`
  - `collectionCoverageKey` → `user_search_logs.collection_coverage_key`
- Demand queries/services:
  - Poll demand uses `location_key`.
  - Keyword collection demand uses `collection_coverage_key`.

3. Scheduler target set

- Schedule by **collectionCoverageKey** (not by subreddit name) to avoid duplicate cycles when multiple subreddits map to one coverageKey.
- Within a cycle, choose the subreddit(s) to execute against (primary by default; rotate additional mappings over time).

### Phase 7 — Cleanup (delete legacy fields + docs)

- Remove legacy plan references and outdated assumptions.
- Ensure there is no “old path” still writing/reading deprecated fields.
- Update dashboards/alerts where relevant (full work is in observability plan).
- Drop unused legacy columns once the slice model is fully in place:
  - in `collection_entity_priority_metrics`: `priority_score`, `data_recency_score`, `data_quality_score`, `user_demand_score`, `is_new_entity`, and `last_selected_at` (attempt history becomes the source of truth).

## Minimal Observability Safety Net (Ship With This Plan)

Ship the smallest set of signals needed to safely iterate without tests:

- `cycleId` propagated end-to-end.
- `keyword_cycle_summary` log event + `keyword_term_summary` log event.
- 3–6 Prometheus metrics (low-cardinality):
  - cycles_total (success/error),
  - cycle_duration histogram,
  - reddit_api_calls_total,
  - terms_selected / terms_deduped,
  - no_results_terms_total.

Full, cohesive observability work is tracked in `plans/keyword-collection-observability-overhaul.md`.

## Validation (No Tests)

We are skipping tests, so validation is operational:

- Compare old vs new selection outputs in dry-run mode for a few coverageKeys (before enabling execution).
- Confirm zero duplicate `normalizedTerm` per cycle.
- Confirm generic tokens never become candidate terms.
- Confirm cooldown/backoff prevents repeated no-results terms from consuming daily budgets.
- Confirm slice counts and underfill/reallocation behavior matches configuration.

## Open Items (Only What’s Truly Unresolved)

- Reassess slice budgets, caps, and scoring weights after real usage (production data), using yield metrics per slice (posts/comments/connections created per term) and cost metrics (Reddit API calls and no-results rates).

## References (Code Touchpoints)

- Scheduler: `apps/api/src/modules/content-processing/reddit-collector/keyword-search-scheduler.service.ts`
- Orchestrator: `apps/api/src/modules/content-processing/reddit-collector/keyword-search-orchestrator.service.ts`
- Current selection service: `apps/api/src/modules/content-processing/reddit-collector/entity-priority-selection.service.ts`
- Search logging + metadata: `apps/api/src/modules/search/search.service.ts`
- Demand aggregation: `apps/api/src/modules/analytics/search-demand.service.ts`
- Poll topics from search demand: `apps/api/src/modules/polls/poll-scheduler.service.ts`
- Coverage key resolution: `apps/api/src/modules/coverage-key/coverage-key-resolver.service.ts`
- On-demand requests (legacy): `apps/api/src/modules/search/on-demand-request.service.ts`, `apps/api/prisma/schema.prisma` (`OnDemandRequest`)
- Search UI shortcuts (mobile): `apps/mobile/src/screens/Search/index.tsx`
- Observability plan: `plans/keyword-collection-observability-overhaul.md`
