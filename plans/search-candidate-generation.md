# Search Candidate Generation (Score-Ranked)

This plan captures the agreed direction for improving search relevance while keeping **ranking purely by existing score** (restaurant score for restaurants, dish/connection score for dishes).

## Goals

- Make relevance a built-in property of the system via **candidate generation**, not a “relevance sort mode”.
- Keep existing ordering logic: **score-based ranking stays unchanged**.
- Return two lists (`dual_list`) that feel consistent:
  - **Dish list**: only shows items that are actually dishes/connections.
  - **Restaurant list**: only shows restaurants that have at least **one connection** in our dataset.
- Use aliases everywhere they can improve recall.
- Support mixed queries containing any combination of:
  - food entities, restaurant entities
  - food attributes, restaurant attributes
  - optional bounds/openNow/price/min-votes filters
- Avoid “ignored intent” outcomes:
  - Do **not** show “attribute-only” results that lose the user’s primary entity (e.g., never show “spicy-only” for “taco spicy”).

## Non-Goals (for now)

- Changing the score formulas / ranking functions.
- Introducing a separate “relevance score” ordering.
- Showing restaurants with zero connections (even if name matches query).

## Hard Eligibility Rules

These rules apply regardless of query mix and relaxation stage.

- **Dish list eligibility**: a result must be a `core_connection` row (dish card is always renderable).
- **Restaurant list eligibility**: a result must be a restaurant with `>= 1` connection in our dataset.
  - “Restaurant name matches query” is not sufficient alone.

## Candidate Generation Overview

Candidate generation should be **multi-branch** (union of evidence sources), followed by existing score ranking.

### Evidence branches (high-level)

- **Entity-ID evidence** (primary)
  - Food: `food_id IN …` and/or `categories && …`
  - Attributes: `food_attributes && …`, `restaurant_attributes && …`
  - Restaurant: explicit restaurant IDs
- **Text evidence** (supporting / expansion)
  - Use `name + aliases` to find additional relevant entity IDs when the entity graph is incomplete or terms vary (plural, typos, alias-only naming).
  - Do not directly create dish results from restaurant text matches.

## Query-Aware Restaurant Card “Top Dishes”

When a query includes a primary food target (e.g., taco), restaurant cards should not show “top dishes overall” if that contradicts the query.

Recommendation:

- Make `topFood` **query-aware**, filtered by the same dish/connection constraints used to decide relevance for the current search stage (food IDs, category overlap, and any active attribute constraints).
- Keep ordering within `topFood` score-based (existing dish/connection score).

### Aliases in query-aware top dishes

Use aliases via the same **ID expansion** step as candidate generation:

- Expand food/category/attribute IDs from `name + aliases`.
- Apply the expanded ID sets inside the query-aware `topFood` filter.
- Avoid adding a separate “text match” filter inside the `topFood` subquery (keep it consistent and debuggable).

## Alias Usage (Strongly Recommended)

Use aliases for **every entity type** during text matching / ID expansion:

- Foods, restaurants, food attributes, restaurant attributes should all be searchable by `name` and `aliases`.
- Aliases do not apply directly to ID-array filters; instead, aliases help us find the right entity IDs to feed into those filters.

## Text Retrieval: Use It as ID Expansion (Not Ordering)

We trust the entity graph. Text retrieval is added specifically to improve recall when the graph is missing links.

### ID expansion pattern

- Input: the user’s query terms (and/or normalized LLM outputs).
- Query `core_entities` via text search over `name + aliases` to find additional entity IDs of the appropriate type(s).
- Merge expanded IDs into the existing resolved ID sets.
- Run the existing ID-based SQL using the expanded sets.

### Examples where ID expansion adds value

- “taco” should also pull entities/categories like “birria tacos”, “fish tacos”, “al pastor tacos” even if those aren’t linked to the base “taco” entity ID via categories/attributes.
- Pluralization/typos: “tacos”, “taco’s”, “tacco” can still land on the same underlying IDs.
- Alias-only naming: entity exists but the canonical name doesn’t match the user query; alias does.

## Progressive Relaxation (Built-In)

When a query includes multiple constraints, attempt strict intent first, then broaden if too few results.

### Threshold

- Define a “too small” threshold (initial: `< 10` strict results on page 1) and apply progressive relaxation when below it.
- UI initial display target (page 1):
  - Show up to `5` strict items in an “Exact matches” section (score-sorted).
  - Then show a “Show more exact matches” row if strict has more than 5 but less than 10.
  - Then show the relaxed section (“Broader matches”, score-sorted) even if not all strict items are currently expanded (per UX decision).

### Principle: Keep the primary target

- If the query contains a primary food entity (e.g., taco), never broaden into attribute-only results.
- If the query contains an explicit restaurant entity (e.g., Taco Bell), never broaden into non-restaurant results.

### Dish list relaxation

Dish list should only return connections that are connected to the search.

- Attempt A (strict): primary food match AND food attribute match (when provided/resolved) AND restaurant attribute match (when provided/resolved) AND explicit restaurant match (when provided).
- If too small:
  - Drop attribute constraints first (food/restaurant attributes), but keep the primary food/restaurant constraint.
  - Do not include “attribute-only” connections that don’t match the primary food/restaurant.

### Restaurant list relaxation

Restaurant list should only return restaurants with `>= 1` connection.

- Attempt A (strict): restaurant must have evidence for the primary food and satisfy restaurant attribute constraints (when provided/resolved), plus bounds/openNow/price.
- If too small:
  - Drop restaurant attribute constraints first, but keep primary food evidence and eligibility gates.

### Stage selection when both modifiers exist (adaptive)

When both `foodAttributes` and `restaurantAttributes` are present, prefer an adaptive relaxation order:

1. Run `strict`.
2. If `< threshold`, evaluate both single-drop stages:
   - `relaxed_restaurant_attributes` (drop restaurant attributes only)
   - `relaxed_food_attributes` (drop food attributes only)
3. Choose the stage that yields the higher `primaryCount`, where:
   - `primaryCount = min(dishCount, restaurantCount)` for that stage (page-level counts on page 1).
4. If still `< threshold`, fall back to `relaxed_modifiers`.

Rationale: attribute coverage varies by market and term; this keeps intent as tight as possible while still producing enough results.

## Sectioned Results UX (Page 1)

When relaxation occurs, page 1 should be rendered as two score-sorted sections:

- **Exact matches**: strict results only (score-sorted)
  - Show up to 5 initially.
  - If strict has 6–9, show a “Show more exact matches” row that expands/collapses the remainder of the strict items.
- **Broader matches**: relaxed-only results (score-sorted)

Notes:

- “Broader matches” should exclude any IDs already shown in strict.
- This is intended to replace popups/toggles: explanation is baked into the list.
- Page 2+ continues with the combined pool (score-sorted), excluding already-returned IDs. Section separators are page-1 only.

## On-Demand Requests (How This Fits the Existing System)

The current “on-demand” system is primarily a demand recorder:

- Search records unmet demand into `collection_on_demand_requests` with `OnDemandReason = unresolved | low_result`.
- Later, keyword term selection (e.g., `KeywordSliceSelectionService`) uses those records (notably the “unmet” slice) to prioritize scheduled keyword searches.

### With progressive relaxation

If strict intent yields too few results and we relax to return something usable:

- Still record a `low_result` request for the strict intent (that’s a real unmet-demand signal).
- Attach context metadata indicating which constraints were relaxed (food vs restaurant attributes) and what the strict vs relaxed counts were.

### Fix: ensure counts are actually recorded

`OnDemandRequestService` currently looks for `context.restaurantCount` and `context.foodCount` when persisting `resultRestaurantCount` / `resultFoodCount`.

Today, low-result search context uses `dishCount` (not `foodCount`), so `resultFoodCount` can be silently missing in on-demand rows.

Follow-up:

- Standardize on `foodCount` across search + interpretation contexts (or teach the on-demand service to accept both keys).

## On-Demand Context Contract (Recommended Payload Shape)

`OnDemandRequestService.recordRequests(requests, options, context)` persists a JSON `metadata.context` blob on each on-demand request record. This is our best place to record _why_ the term was unmet without changing user-facing behavior.

Design goals:

- Consistent keys across `unresolved` and `low_result` recordings.
- Keep top-level primitives for backwards compatibility (`restaurantCount`, `foodCount`).
- Put richer details under namespaced objects to avoid key collisions.
- Avoid large payloads (cap arrays, avoid full SQL previews, etc.).

### Top-level keys (for existing persistence helpers)

These should exist when applicable so `OnDemandRequestService` can reliably persist counts:

- `restaurantCount`: number (page result count for restaurants at the stage being recorded)
- `foodCount`: number (page result count for dishes at the stage being recorded)
- `planFormat`: string (e.g., `dual_list`)

### Namespaced keys (recommended)

```ts
type OnDemandContext = {
  // Required-ish
  kind: 'search';
  recordedAtIso?: string;
  planFormat?: 'dual_list' | string;

  // Query lineage
  query: {
    sourceQuery?: string; // what the user typed (pre-strip) if available
    normalizedQuery?: string; // after generic-token stripping / normalization
    submissionSource?: 'manual' | 'recent' | 'autocomplete' | 'shortcut';
    searchRequestId?: string;
  };

  // Location / viewport context (keep compact)
  viewport?: {
    bounds?: MapBoundsDto;
    eligibleForOnDemand?: boolean;
    coverageKeyUi?: string | null;
    coverageKeyCollection?: string | null;
    locationBias?: { lat: number; lng: number; radiusMeters?: number };
  };

  // Filters applied (for later analysis)
  filters?: {
    openNow?: boolean;
    priceLevels?: number[];
    minimumVotes?: number | null;
  };

  // Result counts (page-level + optional totals if available)
  counts?: {
    stage:
      | 'strict'
      | 'relaxed_restaurant_attributes'
      | 'relaxed_food_attributes'
      | 'relaxed_modifiers'
      | 'unresolved';
    page?: { restaurants: number; dishes: number };
    totals?: { restaurants?: number; dishes?: number };
    strictPage?: { restaurants: number; dishes: number }; // when recording after relaxation
  };

  // Why strict failed / what was relaxed
  relaxation?: {
    ran?: boolean; // true if we executed a relaxed stage
    fromStage?: OnDemandContext['counts']['stage'];
    toStage?: OnDemandContext['counts']['stage'];
    dropped?: {
      foodAttributes?: boolean;
      restaurantAttributes?: boolean;
    };
    threshold?: number; // e.g., 5
  };

  // Signals (optional)
  signals?: {
    hasNameMatchCandidates?: boolean; // e.g., restaurant name matches term but no connection evidence
    idExpansion?: {
      foodsAdded?: number;
      restaurantsAdded?: number;
      foodAttributesAdded?: number;
      restaurantAttributesAdded?: number;
    };
  };
};
```

Notes:

- `sourceQuery` is worth recording because we already strip generic tokens; having both lets us debug “best tacos” vs “tacos”.
- `coverageKeyCollection` is the key the keyword scheduler uses when selecting unmet terms; capture it when bounds exist.
- `signals.hasNameMatchCandidates` helps distinguish “we literally have no coverage” vs “we have likely restaurants but missing dish evidence”.

### Cooldown + write volume (follow-up)

`SEARCH_ON_DEMAND_COOLDOWN_MS` and `SEARCH_ON_DEMAND_MAX_ENTITIES` are documented in `apps/api/src/modules/search/README.md` but are not currently enforced in code.

Recommended follow-ups when implementing relaxation-aware on-demand:

- Enforce a cooldown window so repeated searches don’t continuously upsert the same on-demand rows.
  - Goal: reduce write load while still capturing distinct user counts and “last seen” freshness.
- Cap how many entities/terms we record per search (e.g., primary target + top N modifiers) to avoid flooding the unmet slice for long/complex queries.

### “Restaurant name matches taco but no taco connections”

We should not surface the restaurant as a taco result (no connection evidence), but we can treat this as unmet demand:

- Record a `low_result` request for the **food term/entity** (and relevant modifiers) scoped to the current location/bounds context.
- Optionally include a context flag like `hasNameMatchCandidates: true` so the scheduler can prioritize closing the gap.

### Optional: compound unmet terms (use cautiously)

If a strict combination is under-covered (e.g., “taco + patio”), consider recording a compound term like `taco patio` as an additional on-demand request term.

This can improve future keyword-search coverage for multi-constraint intents, but it can also introduce noisy terms; treat this as an optional experiment behind internal thresholds (e.g., only when strict results are 0 and both components are high-confidence).

## Diagnostics (Planned / Debug-Only)

Add internal diagnostics to make search behavior explainable without adding a user-facing “relevance mode”:

- Record which stage executed (`strict` vs relaxed and which modifiers were dropped).
- Record strict vs relaxed counts when relaxation occurs.
- Persist this in `plan.diagnostics.notes` and/or `metadata.analysisMetadata` for debugging/observability.

## Attribute-Only Queries (Primary Target = Attribute)

When there is no explicit restaurant entity and no food entity, the query can still be valid if it contains attributes.

Key rule: the “never return attribute-only” constraint only applies when a **food** or **restaurant** primary exists. For attribute-only queries, the attribute becomes the primary target.

### Food-attribute-only (e.g., “spicy”)

Dish list should still be “connected to the search” even when the primary is an attribute. Recommended candidate set:

- Primary (structured): connections where `food_attributes && attributeIds`.
- Fallback/expansion (text → IDs, same as the normal search expansion idea):
  - Use text search over `core_entities.name + aliases` to find **food entities** and **category entities** that mention the attribute term (e.g., “spicy ramen”, “extra spicy chicken”).
  - Include connections where `food_id IN expandedFoodIds OR categories && expandedCategoryIds`.
- Dedup by `connection_id`, keep score ordering.

Restaurant list:

- Restaurants must have `>= 1` connection that matches the dish candidate rules above.
- Restaurant card `topFood` stays query-aware under the attribute constraints.

### Restaurant-attribute-only (e.g., “patio”)

Restaurant list:

- Restaurants where `restaurant_attributes && patioAttributeIds` AND `>= 1` connection (global eligibility).
- Restaurant card `topFood` can be overall top dishes unless additional food/food-attribute constraints exist.

Dish list:

- Only show dishes if they’re connected to the restaurant candidates above (still connections-only), ordered by dish score.

### Mixed attribute-only (food attribute + restaurant attribute)

- `strict`: require both.
- Relaxation: use the adaptive stage-selection strategy above.

## “Taco” Walkthrough (Why This Is Better Than Today)

### Today

- Dish list is reasonably relevant because it filters connections by food ID and category overlap.
- Restaurant list is often irrelevant because it does not filter restaurants by food evidence at all; it returns “top restaurants in bounds”.

### Proposed

- Dish list candidates (union):

  - `food_id` matches taco IDs
  - OR `categories` overlap taco IDs (supports broad category matching)
  - OR (optional) `food_attributes` overlap when explicitly provided/resolved
  - plus ID expansion from `name + aliases` to add taco-related entities that aren’t linked properly
  - Then sort by existing dish score.

- Restaurant list candidates (union), with `>= 1` connection required:
  - Restaurants that have matching taco connections (same logic as dish candidate generation, aggregated to restaurants)
  - Do not include restaurants as taco candidates solely due to restaurant name/alias matches unless they also have at least one taco-relevant connection (same gate as above). Use name/alias matching for ID expansion + on-demand hints instead.
  - Then sort by existing restaurant score.

Result: restaurant list becomes “taco restaurants (in our dataset)”, while still score-ranked.

## Deduplication

- Dish list: dedupe by `connection_id`.
- Restaurant list: dedupe by `restaurant_id`.
- If progressive relaxation is implemented as multiple passes, merge results in order:
  - Always include strict results.
  - Add relaxed results not already present.
  - Final ordering remains score-based (strict results generally float up naturally).

## Implementation Outline (When We Build This)

1. Define canonical “primary targets” (food/restaurant) vs attribute modifiers for each search request.
2. Add ID expansion helper(s) reusing existing Postgres search primitives over `name + aliases`.
   - Expand IDs by entity type: food entities for dish candidates; restaurant entities for restaurant candidates; attribute entities where applicable.
3. Update restaurant candidate generation to incorporate “has matching connections” (primary fix).
4. Add progressive relaxation logic for mixed constraints:
   - Strict attempt first; if too small, relax in a consistent order while preserving primary targets.
5. Keep existing score ordering for both lists.
6. Add a diagnostic note in the query plan indicating which relaxation stage ran (for debugging).

## ID Expansion Guardrails (Liberal Defaults)

ID expansion is meant to improve coverage without undermining score-ranked relevance. Initial guidance:

### When to run expansion

Run text → ID expansion when at least one is true:

- strict results are low (below threshold), or
- strict results are below the expansion trigger (initial: `< 25` strict total candidates; tunable via env, not tied to pagination), or
- unresolved terms exist, or
- query is short / variant-prone (pluralization/punctuation/typos).

Suggested env knob:

- `SEARCH_EXPANSION_STRICT_COVERAGE_TARGET` (default `25`)
- `SEARCH_EXPANSION_FOOD_CAP` (default `25`)
- `SEARCH_EXPANSION_ATTRIBUTE_CAP` (default `15`)
- `SEARCH_EXPANSION_MAX_TERMS_PER_TYPE` (default `3`)

### Matching rules (liberal but intentional)

Use existing Postgres text signals (same family as autocomplete):

- Always include:
  - strong name hits (prefix / contains depending on query length)
  - strong alias hits (contains)
- Include fuzzy (pg_trgm similarity) only when query length supports it:
  - length ≤ 3: no fuzzy; require prefix/contains
  - 4–5: similarity ≥ 0.55
  - 6–8: similarity ≥ 0.45
  - 9+: similarity ≥ 0.35

### Caps (per entity type, initial)

To keep behavior predictable and avoid weak-match flooding:

- food IDs: up to 25
- category IDs: up to 25
- attribute IDs (food/restaurant attributes): up to 15

These are tuning knobs; start liberal and adjust only if we see noisy expansions or perf issues.

## Concrete Contract (Inputs → Constraints → Outputs)

This contract keeps behavior consistent across all permutations (food/restaurant + food/restaurant attributes), while staying score-ranked.

### Inputs

- `entities.food[]` (0..n)
- `entities.restaurants[]` (0..n)
- `entities.foodAttributes[]` (0..n)
- `entities.restaurantAttributes[]` (0..n)
- plus bounds/openNow/price/min-votes/pagination

### Derived constraints

- **Primary target** (MUST)
  - If explicit restaurant entity exists: restaurant scope is locked to those restaurant IDs (both lists).
  - Else if food entities exist: relevance must remain anchored to those food IDs (expanded).
- **Modifiers** (relaxable)
  - Food attributes (when present/resolved)
  - Restaurant attributes (when present/resolved)

### Stages

- `strict`: primary + all modifiers.
- `relaxed_restaurant_attributes`: primary + food attributes (drop restaurant attributes).
- `relaxed_food_attributes`: primary + restaurant attributes (drop food attributes).
- `relaxed_modifiers`: primary only.

Stage selection must be deterministic and must never drop the primary target.

### Outputs

- **Dish list**
  - Always connections.
  - Must always match the primary target (food or explicit restaurant).
  - Modifiers applied per stage.
  - Never returns modifier-only results (e.g., never “spicy-only”).
- **Restaurant list**
  - Always `>= 1` connection globally.
  - For food-primary queries: must have at least one matching connection under the current stage filters.
  - For restaurant-primary queries: only those restaurants (if they have `>= 1` connection).
  - Restaurant card `topFood` is query-aware under the current stage filters.

## Open Questions / Knobs

- **Relaxation threshold**: currently `< 10` strict results on page 1 (tunable; can be moved to an env/config knob later).
- Max ID expansions per type (to avoid query blow-up).
- Similarity thresholds for alias/name matching (per type).
- Whether restaurant name-match should ever directly create restaurant candidates for food-primary queries (current preference: no; treat as ID expansion + unmet-demand hint only).

## Implementation Notes (What We Actually Shipped)

This section records intentional differences between the plan and the current implementation so the docs stay honest.

- **Expansion trigger**: implemented as “strict total coverage (total dishes + total restaurants) < `SEARCH_EXPANSION_STRICT_COVERAGE_TARGET` (default 25)”, not tied to page size.
- **Expansion scope (today)**:
  - Expands **food** IDs (EntityType `food`) from food query terms.
  - Expands **food_attribute** IDs from food-attribute query terms.
  - Expands **restaurant_attribute** IDs from restaurant-attribute query terms.
  - Does **not** currently expand restaurant entities for restaurant-primary recall (entity resolver remains the primary mechanism there).
- **Attribute-only OR fallback**:
  - Implemented only for **food-attribute-primary** queries (e.g., “spicy” with no explicit food/restaurant).
  - When expansion runs, the dish/restaurant candidate filter becomes: `food_attributes match` **OR** `(food_id/categories match expanded food IDs from attribute text)`.
  - This is implemented via an internal `SearchExecutionDirectives` flag passed into the SQL builder (no filter-clause “payload tags” required).
- **On-demand**:
  - Relaxation-aware low-result on-demand context is implemented.
  - Cooldowns / max-entities caps are enforced in `OnDemandRequestService`:
    - `SEARCH_ON_DEMAND_COOLDOWN_MS` (default `300000`)
    - `SEARCH_ON_DEMAND_MAX_ENTITIES` (default `5`)

## Architecture Improvements (Status)

Search is the core product surface, so it’s worth tightening the architecture beyond “it works”.

### 1) Shared text retrieval primitive (shipped)

Goal: stop maintaining separate “autocomplete search” vs “search expansion” implementations.

- Introduced a shared `EntityTextSearchService` (name + aliases + fuzzy + phonetic) with:
  - tunable similarity thresholds
  - optional location scoping for restaurants
  - hard caps per request
- Autocomplete and search expansion both call this service.

### 2) Make alias search indexable (shipped)

Goal: avoid `unnest(aliases)` scans for alias contains checks.

- Add a Postgres trigram GIN index on an expression like:
  - `lower(array_to_string(aliases, ' ')) gin_trgm_ops`
- Update alias checks to query that expression (or a generated/denormalized column) instead of `unnest`.

### 3) Expansion trigger should use unresolved context (shipped)

Goal: allow expansion to run when we _know_ the resolver couldn’t map something, not only when strict coverage is low.

- Pass unresolved term groups from orchestration into `SearchService` (via a typed request context field).
- Trigger expansion when:
  - strict coverage is below target OR
  - unresolved terms exist OR
  - query is short / variant-prone (configurable)

### 4) Cleaner control flow (shipped)

Goal: reduce “spread out semantics” and make the system explainable/debuggable.

- Reduced “payload tags as control plane” by moving the attribute-only OR behavior behind internal `SearchExecutionDirectives` (passed into the SQL builder).
- Extracted stage execution + relaxation stage selection helpers so the main `runQuery` control flow is easier to follow.
- Added a dev-only `analysisMetadata.searchExplain` payload to make “why did we do this?” questions answerable without digging through logs.
- Introduced an explicit internal constraint model (`SearchConstraints`) that compiles into a `QueryPlan`, so intent/modifiers/relaxation are represented in one typed object.

Optional follow-up (if we want to go further):

- (Done) Plan expansion is now applied during constraint building (so the compiler emits the final `QueryPlan` directly, without post-compile patching).

## Performance Improvements (Shipped)

These are speed-focused follow-ups that keep the same candidate semantics and score-based ordering.

### 1) Add a real text-search index for `core_entities`

- Add supporting indexes/functions so entity text lookup can rely on indexes rather than `LIKE '%term%'` scans:
  - `name` prefix index for short queries (autocomplete / typed prefix)
  - `name` trigram index for fuzzy matches
  - `name+aliases` full-text index for word queries (GIN on `crave_entity_search_tsv(name, aliases)`)

### 2) Replace `LIKE '%term%'` with indexed trigram matching

- For non-short terms, prefer trigram operators + similarity ordering (and a cutoff) rather than substring `LIKE`.

### 3) Batch multi-term expansion

- Expand N terms in a single query per entity type using `VALUES (term)` + `LATERAL` top-N, instead of one query per term.

### 4) Add short-lived caching for expansion lookups

- Cache text→ID expansion results per `{locationKey, entityType(s), normalizedTerm}` with a short TTL and a max entry cap.

### 5) Gate phonetic fallback

- Only run phonetic fallback when earlier tiers (prefix/FTS/trigram) can’t fill the requested limit, and only for sufficiently long terms (and when “low results”).
