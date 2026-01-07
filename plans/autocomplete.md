ry Analytics + User Interaction Signals (SearchLog-only)

## Summary

This plan implements (1) query-level analytics **without** introducing a new `search_query_log` table, (2) a dedicated **recently viewed restaurants** feature (with its own table), and (3) a clean “first‑class signal” taxonomy that powers **recents UI**, **autocomplete ranking**, and **collection priority**.

Key constraint: `user_search_logs` remains the single store for “search submitted” analytics, even though it is **per-target** (one search can write multiple rows). We make query-level analytics reliable by adding a **per-search request id** and **result counts** to each written `user_search_logs` row.

## Goals / Non-goals

### Goals

- Keep `user_search_logs` as the only “search analytics” table (no `search_query_log`).
- Add query-level grouping + result counts to `user_search_logs` to enable query analytics with deduping.
- Add a dedicated “restaurant views” store and API for recently viewed restaurants.
- Wire mobile to emit the minimum first-class signals:
  - `search_submitted`
  - `restaurant_opened` (restaurant overlay open from Search UX only)
  - `favorite_toggled`
- Use these signals to improve UX:
  - Search suggestion screen (empty query) shows **Recent searches** + **Recently viewed** (restaurants)
  - Autocomplete (typed query) mixes: entity matches + query suggestions + (deduped) favorites + (deduped) recently viewed restaurants, with small, controlled boosts.

### Non-goals (for this iteration)

- Dashboards / BI / metrics UI.
- Recording every keystroke (typing telemetry).
- Logging “no entity target” searches (we keep current behavior: no targets ⇒ no `user_search_logs` rows).

## Event taxonomy + recommended downstream consumers

The key best-practice decision is: treat events as **signals** with clear semantics, then decide which systems consume them. We can implement some events as explicit API calls, and others as metadata attached to the existing search request.

### Events (minimum set)

| Event               | When it fires                                                                                               | Stored where                                                                           | Primary consumers                                                        | Notes                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_submitted`  | User submits a search (manual submit, recent tap, autocomplete tap, shortcut)                               | `user_search_logs` (existing)                                                          | Recents UI, query suggestions, autocomplete ranking, collection priority | 1 search ⇒ N `user_search_logs` rows (one per resolved target entity). We add `searchRequestId` + result totals to dedupe per-search later. |
| `restaurant_opened` | Restaurant overlay opens **from Search UX only** (suggestion tap, results card, single-candidate auto-open) | `user_restaurant_views` (new)                                                          | “Recently viewed” UI, personal autocomplete boost, collection priority   | Do **not** record opens from Favorites/Bookmarks screens. In this UX, “click” and “open” are the same event.                                |
| `favorite_toggled`  | User favorites/unfavorites an entity                                                                        | `user_favorites` (existing) + `collection_entity_priority_metrics.favoriteCount` (new) | Autocomplete boost, collection priority                                  | Favorites are durable preference; boost is “always on” when relevant.                                                                       |

**About “autocomplete_selected”:** we do not emit it as a separate API event. Instead, we capture it on `search_submitted` via `submissionSource='autocomplete'` and (for non-restaurant entity selections) `selectedEntityId/selectedEntityType` so collection priority can give that entity an extra, small bump.

### Optional “nice to have” signals (don’t block the core)

- `search_filters_applied` (openNow/price/minVotes): store as part of `search_submitted` metadata (`metadata.filtersApplied`). Useful for future “why zero results” analytics.

## Storage changes

### 1) Extend `user_search_logs` for query-level analytics

**Why:** `user_search_logs` is per-target, so “query-level analytics” must dedupe. A stable `searchRequestId` makes this clean, and `totalResults` enables “zero result rate” without a second table.

#### Prisma changes (`apps/api/prisma/schema.prisma`)

- Add fields to `SearchLog`:
  - `searchRequestId String? @map("search_request_id") @db.Uuid`
  - `totalResults Int? @map("total_results")`
  - `totalFoodResults Int? @map("total_food_results")`
  - `totalRestaurantResults Int? @map("total_restaurant_results")`
  - `queryExecutionTimeMs Int? @map("query_execution_time_ms")`
  - `coverageStatus String? @map("coverage_status")` (optional; keep if we find it useful once totals exist)
- Add indexes to support common reads:
  - `@@index([userId, searchRequestId], map: "idx_search_log_user_request")`
  - `@@index([userId, queryText], map: "idx_search_log_user_query")` (supports `/search/history` grouping and prefix lookups)
  - `@@index([queryText], map: "idx_search_log_query_text")` (supports global query suggestions)
  - Add a Postgres-appropriate index for **case-insensitive prefix** suggestion queries (because `LOWER(query_text) LIKE 'prefix%'` won’t use a plain btree index):
    - Prefer a `GIN` trigram index on `query_text` (`pg_trgm`) via a SQL migration, or an expression index on `lower(query_text)` if we keep the `LOWER()` query.
- Add `search_submitted` metadata fields to `SearchLog.metadata` (no schema change):
  - `submissionSource`: `'manual' | 'autocomplete' | 'recent' | 'shortcut'`
  - `submissionContext`: `{ matchType?: 'entity'|'query', typedPrefix?: string, selectedEntityId?: string, selectedEntityType?: string }`
  - `filtersApplied`: `{ openNow?: boolean, priceLevels?: number[], minimumVotes?: number }`

**Idempotency (recommended):**

- If mobile supplies `searchRequestId`, add a uniqueness guard to prevent duplicates on retries:
  - `@@unique([searchRequestId, entityId], map: "uq_search_log_request_entity")`
  - This preserves “one row per entity per search request” while still allowing repeated searches over time.

### 2) Add `user_restaurant_views` (deduped aggregate state)

**Why:** “Recently viewed restaurants” is an aggregate list (distinct + ordered by recency). Storing it as an append-only event stream makes reads and deduping harder than necessary.

#### Prisma model (`apps/api/prisma/schema.prisma`)

- Create `RestaurantView` (table `user_restaurant_views`):
  - Keys:
    - `userId` (FK → `User`)
    - `restaurantId` (FK → `Entity` where `type = restaurant`)
  - Columns:
    - `lastViewedAt DateTime @map("last_viewed_at")`
    - `viewCount Int @default(1) @map("view_count")`
    - `metadata Json? @default("{}")` for source + optional correlation (`source`, optional `searchRequestId`)
  - Constraints / indexes:
    - `@@id([userId, restaurantId])` (or `@@unique([userId, restaurantId])`)
    - `@@index([userId, lastViewedAt(sort: Desc)], map: "idx_restaurant_views_user_time")`

#### View counting semantics (best practice)

- Apply a “view cooldown” so open/close spam doesn’t inflate counts:
  - If `lastViewedAt` is within (e.g.) 2 minutes, only update `lastViewedAt` (don’t increment `viewCount`).

## API changes (apps/api)

### 1) Search request/response plumbing

**Goal:** every logged `search_submitted` has a stable id and result counts.

- Update DTOs:
  - `SearchQueryRequestDto` + `NaturalSearchRequestDto`:
    - `searchRequestId?: string` (UUID)
    - `submissionSource?: 'manual'|'autocomplete'|'recent'|'shortcut'`
    - `submissionContext?: { matchType?: 'entity'|'query', typedPrefix?: string, selectedEntityId?: string, selectedEntityType?: string }` (keep small + explicit)
- Update `SearchService.runQuery()`:
  - Ensure there is a `searchRequestId`:
    - Prefer client-supplied (for retry idempotency).
    - Otherwise generate server-side UUID.
  - After query execution, compute totals:
    - `totalResults = totalFoodResults + totalRestaurantResults`
- Pass this context into the search logging function so it can be written onto each `user_search_logs` row.
- Update `SearchService.recordQueryImpressions()` / `recordSearchLogEntries()`:
  - Accept a context param (`searchRequestId`, totals, coverageStatus, etc.) and write it into the new columns + metadata.
  - Include `filtersApplied` metadata from the request (`openNow`, `priceLevels`, `minimumVotes`).
  - If `submissionSource='autocomplete'` and `selectedEntityId` is present and **not a restaurant**, increment `EntityPriorityMetric.autocompleteSelections` for that selected entity.
- Update `SearchOrchestrationService.runNaturalQuery()`:
  - Propagate `searchRequestId` + submission fields from natural request → structured request so logging is consistent.
- Return `searchRequestId` in `SearchResponse.metadata` (update `packages/shared/src/types/search.ts`):
  - This is useful for correlating later `restaurant_opened` (view) events.

### 2) Restaurant view history endpoints

Add a small controller/service pair (either a new module `history` or inside `search`):

- `POST /history/restaurants/viewed`
  - Body: `{ restaurantId: string; searchRequestId?: string; source?: string }`
  - Auth: required; userId derived from auth token.
  - Behavior:
    - Upsert `(userId, restaurantId)`
    - Apply cooldown before incrementing viewCount
    - Update lastViewedAt
- Allowed `source` values (examples): `search_suggestion`, `results_sheet`, `auto_open_single_candidate`, `autocomplete` (explicitly do **not** send `bookmarks`/Favorites).
- `GET /history/restaurants/viewed?limit=10`
  - Returns a list ordered by `lastViewedAt desc`
  - Join `Entity` to return display fields (`name`, `city`, `region`, `priceLevel`, etc.)
  - Optional query params for typed filtering:
    - `prefix` (server-side filtering) OR client-side filtering after fetching limit N.

### 3) (Optional for now) Evolve `/search/events/click`

We do not need a separate “click vs open” concept for restaurants right now (open is guaranteed), so this endpoint is optional. If we keep it, here are future click ideas worth tracking:

- Which list the tap came from (`suggestion_list` vs `results_sheet`)
- List position and page (rank in list, pagination page)
- Card subtype (`restaurant_card` vs `dish_card`)
- Query context (`searchRequestId`, submitted query text, applied filters)
- Dwell time between search submit → open (proxy for relevance)

If none of these are needed soon, consider deleting `/search/events/click` (it’s currently logger-only and unused by the app).

## Mobile changes (apps/mobile)

### 1) Emit consistent `searchRequestId` + submission source

- On every submitted search (manual submit, recent tap, autocomplete tap, shortcut button):
  - Generate a UUID (`searchRequestId`) on the client and include it in the search request payload.
  - Set `submissionSource` appropriately.
  - For autocomplete tap, include `submissionContext`:
    - `typedPrefix` (what was in the box when they tapped)
    - `matchType` (`entity` or `query`)
    - `selectedEntityId/selectedEntityType` when the user taps an **entity** suggestion (optional but useful for collection priority)
- Store the most recent `searchRequestId` from the last completed search so it can be attached to `restaurant_opened`.

### 2) Emit `restaurant_opened` when the RestaurantOverlay opens (Search only)

- When `RestaurantOverlay` becomes visible on the Search screen (including “single restaurant candidate” auto-open):
  - Call `POST /history/restaurants/viewed` with:
    - `restaurantId`
    - optional `searchRequestId`
    - `source`: `search_suggestion` | `results_sheet` | `auto_open_single_candidate` | `autocomplete`
- Do **not** emit from Favorites/Bookmarks screens.

### 3) Suggestion screen UI updates

- Empty query (typing inactive):
  - Show two stacked sections:
    - **Recent searches** (existing `/search/history`)
    - **Recently viewed** (new `/history/restaurants/viewed?limit=10`)
- Typed query (typing active):
  - Show a single mixed autocomplete list (no secondary labels under names):
    - entity matches (dish/restaurant icons)
    - query suggestions (suggested search text from `user_search_logs.query_text` prefix matches; capped at 3)
    - favorites and recently viewed restaurants are _not separate sections_; they are injected/boosted into the same list when they match the typed prefix.
  - Icons/badges (recommended):
    - Left icon: dish vs restaurant vs query-text
    - Badges: `heart` for favorite matches, `view` for recently viewed restaurants, `clock` for personal recent-search query suggestions.
  - Deduplicate by canonical key:
    - entities by `entityId`
    - query suggestions by normalized query text

## Autocomplete ranking (apps/api)

### Principle: keep impact controlled + predictable

- Never let views “overpower” text relevance.
- Only apply view boosts when the restaurant actually matches the typed prefix (it will, if it’s already in the candidate set).
- Keep boosts **personal** by default (don’t bake views into global popularity).

### Implementation

- Candidate pool construction (best practice):

  - Start with text search results (current behavior).
  - Union-in any matching favorites (any entity type) and matching recently viewed restaurants (so they can appear even if they wouldn’t make the top-N text list).
  - Add query suggestions (suggested search text) from `user_search_logs.query_text` prefix matches (capped at 3).
  - Deduplicate, then score and rank.

- Scoring (initial, tunable defaults):

  - **Entity matches** keep the existing backbone score:
    - `score = 0.5*confidence + 0.35*globalPopularity + 0.1*userAffinity + favoriteBoost`
  - Add **restaurant view affinity** (restaurants only) as a small component:
    - `viewRecency = exp(-daysSinceLastViewed / 30)` (longer memory than a week; best practice for “recently viewed”)
    - `viewFrequency = min(log1p(viewCount) / log1p(10), 1)`
    - `viewAffinity = 0.7*viewRecency + 0.3*viewFrequency`
    - `score += 0.08*viewAffinity`
  - Keep favorites as a durable boost (already present):
    - `favoriteBoost = 0.05` (applies when the entity is already a candidate match)

- **Query suggestion scoring** (suggested search text):

  - Update `SearchQuerySuggestionService` to return `{ text, globalCount, userCount, source }` where counts are based on `COUNT(DISTINCT searchRequestId)` when available.
  - Treat query suggestions as first-class candidates with their own score so they can intermix with entities:
    - `queryScore = 0.5*1 + 0.35*normalize(globalCount) + 0.1*normalize(userCount) + personalBoost`
    - `personalBoost = source === 'personal' ? 0.05 : 0`
  - Cap query suggestions shown in the final list to 3.
  - (Optional) Suppress query suggestions that have very low counts (e.g., `globalCount < 3` and `userCount < 2`) so they don’t spam.

- Response annotations for UI icons/badges:
  - Extend `AutocompleteMatchDto` to include lightweight flags so the client doesn’t have to re-derive state while typing:
    - `badges?: { favorite?: boolean; viewed?: boolean; recentQuery?: boolean }`
    - or `isFavorite?: boolean`, `isViewed?: boolean`, `querySuggestionSource?: 'personal'|'global'`
  - Populate:
    - `favorite/viewed` for entity matches based on `user_favorites` + `user_restaurant_views` joins
    - `recentQuery` (clock) when `querySuggestionSource === 'personal'`

## Collection priority / on-demand (apps/api)

### On-demand collection

- Keep existing behavior: on-demand triggers only from low-result searches with entity targets.
- Do **not** trigger on-demand from restaurant views.

### Scheduled/priority enrichment (implement now)

We should incorporate app interaction signals as a **small component** of demand (not just a tie-breaker), while keeping the existing connection-based proxy.

#### Data model updates (`apps/api/prisma/schema.prisma`)

- Extend `EntityPriorityMetric` to support additional app-demand signals:
  - `viewImpressions Int @default(0) @map("view_impressions")` (restaurants only; updated on `restaurant_opened`)
  - `lastViewAt DateTime? @map("last_view_at")`
  - `favoriteCount Int @default(0) @map("favorite_count")` (updated on favorite add/remove)
  - `autocompleteSelections Int @default(0) @map("autocomplete_selections")` (updated only for non-restaurant `selectedEntityId`)

#### Write paths

- `search_submitted` (existing): continues to increment `queryImpressions` per resolved entity target.
- `restaurant_opened` (new): increments `viewImpressions` and sets `lastViewAt` for that restaurant entity.
- `favorite_toggled` (existing): FavoritesService increments/decrements `favoriteCount` for that entity.
- `autocomplete selected` (implicit): if `submissionSource='autocomplete'` and `selectedEntityId` is non-restaurant, increment `autocompleteSelections` for that entity.

#### Priority selection scoring changes (`EntityPrioritySelectionService`)

- Keep the existing 3-factor structure (recency/quality/demand) but update `calculateUserDemandScore` to include app-demand signals.
- Initial weighting (tunable defaults):
  - `connectionDemand` (existing proxy from connection activity): **0.6**
  - `appDemand` (new): **0.4**, where:
    - `queryImpressions`: **0.55** (normalized + mild recency via `lastQueryAt`)
    - `autocompleteSelections`: **0.15** (normalized + optional recency if we add `lastAutocompleteSelectedAt` later)
    - `viewImpressions` (restaurants only): **0.20** (normalized + recency via `lastViewAt`)
    - `favoriteCount`: **0.10** (normalized; durable preference)

This keeps app interactions meaningful while still prioritizing entities with strong underlying content signals.

## Backfill / Migration

### Prisma migrations

- Add the new `SearchLog` fields + indexes.
- Add `RestaurantView`.
- Add `EntityPriorityMetric` app-demand fields.

### Backfill (optional)

- `searchRequestId` for existing `user_search_logs` can remain null (analytics can treat null rows as legacy).
- No backfill needed for `user_restaurant_views` initially.

## QA checklist (no tests)

- Focusing search shows both “Recently viewed” and “Recent searches”.
- Opening a restaurant overlay adds it to “Recently viewed” and reorders by recency.
- Typed autocomplete list shows correct icons/badges (dish/restaurant/query + heart/view/clock).
- Autocomplete does not become “all restaurants all the time” (boosts are subtle).

## Rollout / Safety

- Feature flag the autocomplete view boost (server-side), so you can tune weights without shipping a new app.
- Cap list sizes and apply cooldown to avoid abusive event spam.

## Open questions (answer before implementation)

Resolved:

- Count views when the overlay auto-opens from a single restaurant candidate search: **yes**.
- Retention: store full history in `user_restaurant_views`, but only fetch/display the most recent **10**.
- Recent searches include searches that resolve to targets but return 0 results: **yes**.

## Post-implementation note (required)

Implemented defaults (all tunable via `apps/api/.env`):

- Autocomplete scoring: `0.5*textConfidence + 0.35*globalPopularity + 0.1*userAffinity + favoriteBoost + viewAffinityBoost`
  - `AUTOCOMPLETE_BOOST_FAVORITE=0.05`
  - `AUTOCOMPLETE_WEIGHT_VIEW_AFFINITY=0.08`, where `viewAffinity = 0.7*exp(-days/30) + 0.3*min(log1p(viewCount)/log1p(10),1)`
- Query-text suggestions (prefix matches from `user_search_logs.query_text`):
  - Max shown: `AUTOCOMPLETE_QUERY_SUGGESTION_MAX=3`
  - Thresholds: keep if `userCount>=1` or `globalCount>=3`
  - Personal boost: `AUTOCOMPLETE_QUERY_SUGGESTION_PERSONAL_BOOST=0.05`
  - Counts use `COUNT(DISTINCT COALESCE(search_request_id, log_id))` to avoid per-target overcounting.
- Restaurant view history:
  - Cooldown: `RESTAURANT_VIEW_COOLDOWN_MS=120000` (prevents rapid open/close spam from inflating counts)
- Entity priority (collection) demand blend:
  - `connectionDemand` vs `appDemand`: `0.6 / 0.4`
  - `appDemand` weights: `queryImpressions 0.55`, `autocompleteSelections 0.15`, `viewImpressions 0.20` (restaurants), `favoriteCount 0.10`
  - App signal normalization uses log scaling with caps (`*_CAP` env vars) and a mild recency multiplier (`*_RECENCY_DECAY_DAYS`).

Reasoning: keep relevance primarily text-driven, then add small, controlled personalization (favorites/views) and a bounded amount of query-text suggestions so history improves UX without drowning out fresh relevant matches.
