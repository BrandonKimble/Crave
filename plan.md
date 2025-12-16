# Query Analytics + User Interaction Signals (SearchLog-only)

## Summary

This plan implements (1) query-level analytics **without** introducing a new `search_query_log` table, (2) a dedicated **recently viewed restaurants** feature (with its own table), and (3) a clean “first‑class signal” taxonomy that can power **recents UI**, **autocomplete ranking**, and (optionally) **collection priority** later.

Key constraint: `search_log` remains the single store for “search submitted” analytics, even though it is **per-target** (one search can write multiple rows). We make query-level analytics reliable by adding a **per-search request id** and **result counts** to each written `search_log` row.

## Goals / Non-goals

### Goals
- Keep `search_log` as the only “search analytics” table (no `search_query_log`).
- Add query-level grouping + result counts to `search_log` to enable query analytics with deduping.
- Add a dedicated “recently viewed restaurants” store and API.
- Wire mobile to emit the minimum first-class signals:
  - `search_submitted`
  - `autocomplete_selected`
  - `result_opened` (restaurant overlay open = the true “view” moment)
  - `result_clicked` (if distinct from “opened” in your UX)
  - `favorite_toggled`
- Use these signals to improve UX:
  - Search suggestion screen shows **Recent searches** + **Recently viewed restaurants**
  - Autocomplete gets a **small, recency-weighted personal boost** from recent restaurant views (and favorites).

### Non-goals (for this iteration)
- Dashboards / BI / metrics UI.
- Recording every keystroke (typing telemetry).
- Logging “no entity target” searches (we keep current behavior: no targets ⇒ no search_log rows).

## Event taxonomy + recommended downstream consumers

The key best-practice decision is: treat events as **signals** with clear semantics, then decide which systems consume them. We can implement some events as explicit API calls, and others as metadata attached to the existing search request.

### Events (minimum set)

| Event | When it fires | Stored where | Primary consumers | Notes |
|---|---|---|---|---|
| `search_submitted` | User submits a search (manual submit, recent tap, autocomplete tap) | `search_log` (existing) | Recents UI, autocomplete popularity/affinity, future analytics | 1 search ⇒ N `search_log` rows (one per resolved target entity). We add `searchRequestId` + `totalResults` to dedupe per-search later. |
| `autocomplete_selected` | User taps an autocomplete suggestion row | `search_log.metadata` on the resulting `search_submitted` | Future UX tuning; optional ranking tuning | Don’t create a separate event table: represent as `search_submitted.submissionSource = 'autocomplete'` and include suggestion metadata. This works for both entity + query suggestions as long as the search resolves to targets. |
| `result_opened` | Restaurant overlay opens (true view) | `user_restaurant_view` (new) | “Recently viewed” UI, personal autocomplete boost | Distinct from “searched”; captures views from search results, bookmarks, polls, etc. |
| `result_clicked` | User taps a result card row (if you want it distinct) | (Option A) treat as `result_opened` for restaurants; (Option B) add click counters in `EntityPriorityMetric` later | Future UX tuning; possible collection tie-breaker | In current UX, clicking a restaurant card effectively opens the overlay, so you can collapse this into `result_opened` initially. |
| `favorite_toggled` | User favorites/unfavorites an entity | `user_favorites` (existing) | Autocomplete boost; optional collection tie-breaker | This is already persisted as state; you don’t need a separate event log unless you want “when toggled” analytics later. |

### Optional “nice to have” signals (don’t block the core)
- `search_filters_applied` (openNow/price/minVotes): store as part of `search_submitted` metadata. Useful for future “why zero results” analytics.
- `search_abandoned` (typed but not submitted): only if you later want “typing telemetry”; not needed now.
- `restaurant_shared` / `directions_opened`: can be useful for “high intent” signals later, but not required.

## Storage changes

### 1) Extend `search_log` for query-level analytics

**Why:** `search_log` is per-target, so “query-level analytics” must dedupe. A stable `searchRequestId` makes this clean, and `totalResults` enables “zero result rate” without a second table.

#### Prisma changes (`apps/api/prisma/schema.prisma`)
- Add fields to `SearchLog`:
  - `searchRequestId String? @map("search_request_id") @db.Uuid`
  - `totalResults Int? @map("total_results")`
  - (Optional but recommended) `totalFoodResults Int?`, `totalRestaurantResults Int?`, `coverageStatus String?`, `queryExecutionTimeMs Int?`
- Add an index to support common analytics queries:
  - `@@index([userId, searchRequestId], map: "idx_search_log_user_request")`
  - `@@index([queryText], map: "idx_search_log_query_text")` (or `(userId, queryText)` if history queries get slow)
- Add `search_submitted` metadata fields to `SearchLog.metadata` (no schema change):
  - `submissionSource`: `'manual' | 'autocomplete' | 'recent' | 'shortcut'`
  - `submissionContext`: `{ matchType?: 'entity'|'query', suggestionPosition?: number, typedPrefix?: string }`
  - `filters`: `{ openNow?: boolean, priceLevels?: number[], minimumVotes?: number }`

**Idempotency (recommended):**
- If mobile supplies `searchRequestId`, add a uniqueness guard to prevent duplicates on retries:
  - `@@unique([searchRequestId, entityId], map: "uq_search_log_request_entity")`
  - This preserves “one row per entity per search request” while still allowing repeated searches over time.

### 2) Add `user_restaurant_view` (deduped aggregate state)

**Why:** “Recently viewed restaurants” is an aggregate list (distinct + ordered by recency). Storing it as an append-only event stream makes reads and deduping harder than necessary.

#### Prisma model (`apps/api/prisma/schema.prisma`)
- Create `UserRestaurantView` (name can be `UserRestaurantView` or `UserEntityView` scoped to restaurants):
  - Keys:
    - `userId` (FK → `User`)
    - `restaurantId` (FK → `Entity` where `type = restaurant`)
  - Columns:
    - `lastViewedAt DateTime @map("last_viewed_at")`
    - `viewCount Int @default(1) @map("view_count")`
    - (Optional) `lastSearchRequestId String? @db.Uuid` for correlation
    - (Optional) `metadata Json?` for source (`search_results`, `bookmarks`, etc.)
  - Constraints / indexes:
    - `@@id([userId, restaurantId])` (or `@@unique([userId, restaurantId])`)
    - `@@index([userId, lastViewedAt(sort: Desc)], map: "idx_user_restaurant_view_user_time")`

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
    - `submissionContext?: Record<string, unknown>` (keep flexible)
- Update `SearchService.runQuery()`:
  - Ensure there is a `searchRequestId`:
    - Prefer client-supplied (for retry idempotency).
    - Otherwise generate server-side UUID.
  - After query execution, compute totals:
    - `totalResults = totalFoodResults + totalRestaurantResults`
  - Pass this context into the search logging function so it can be written onto each `search_log` row.
- Update `SearchService.recordQueryImpressions()` / `recordSearchLogEntries()`:
  - Accept a context param (`searchRequestId`, totals, coverageStatus, etc.) and write it into the new columns + metadata.
- Update `SearchOrchestrationService.runNaturalQuery()`:
  - Propagate `searchRequestId` + submission fields from natural request → structured request so logging is consistent.
- Return `searchRequestId` in `SearchResponse.metadata` (update `packages/shared/src/types/search.ts`):
  - This is useful for correlating later `result_opened` events.

### 2) Restaurant view history endpoints

Add a small controller/service pair (either a new module `history` or inside `search`):

- `POST /history/restaurants/viewed`
  - Body: `{ restaurantId: string; searchRequestId?: string; source?: string }`
  - Auth: required; userId derived from auth token.
  - Behavior:
    - Upsert `(userId, restaurantId)`
    - Apply cooldown before incrementing viewCount
    - Update lastViewedAt
- `GET /history/restaurants/viewed?limit=20`
  - Returns a list ordered by `lastViewedAt desc`
  - Join `Entity` to return display fields (`name`, `city`, `region`, `priceLevel`, etc.)
  - Optional query params for typed filtering:
    - `prefix` (server-side filtering) OR client-side filtering after fetching limit N.

### 3) (Optional for now) Evolve `/search/events/click`
If you want explicit “clicked” vs “opened”:
- Update `SearchResultClickDto` to include `searchRequestId?: string` and `source?: string`
- Require `@CurrentUser` and persist into future metrics (do not leave as logger-only).

## Mobile changes (apps/mobile)

### 1) Emit consistent `searchRequestId` + submission source
- On every submitted search (manual submit, recent tap, autocomplete tap, shortcut button):
  - Generate a UUID (`searchRequestId`) on the client and include it in the search request payload.
  - Set `submissionSource` appropriately.
  - For autocomplete tap, include `submissionContext`:
    - `typedPrefix` (what was in the box when they tapped)
    - `matchType` (`entity` or `query`)
    - `suggestionPosition`
- Store the most recent `searchRequestId` from the last completed search so it can be attached to `result_opened`.

### 2) Emit `result_opened` when the RestaurantOverlay opens
- When `RestaurantOverlay` becomes visible (the moment you already set `setRestaurantOverlayVisible(true)`):
  - Call `POST /history/restaurants/viewed` with:
    - `restaurantId`
    - `searchRequestId` if available
    - `source` (`search_results`, `autocomplete`, `bookmarks`, etc.)

### 3) Suggestion screen: add “Recently viewed restaurants”
- On search focus (suggestion screen active), fetch:
  - `GET /search/history` (existing) → “Recent searches”
  - `GET /history/restaurants/viewed` (new) → “Recently viewed”
- UI behavior:
  - Empty query: show two sections stacked:
    - Recently viewed restaurants (restaurant rows/cards)
    - Recent searches (strings)
  - Non-empty query:
    - Continue to show autocomplete matches from `/autocomplete/entities`
    - Optionally inject any recently viewed restaurants that match the typed prefix (deduped)
- Update labeling:
  - `matchType === 'query'` should not be labeled “Recent search” unless it truly comes from personal history. Use “Suggested” (or similar) since it’s personal + global today.

## Autocomplete ranking (apps/api)

### Principle: keep impact controlled + predictable
- Never let views “overpower” text relevance.
- Only apply view boosts when the restaurant actually matches the typed prefix (it will, if it’s already in the candidate set).
- Keep boosts **personal** by default (don’t bake views into global popularity).

### Implementation
- In `AutocompleteService.applyPopularityRanking()`:
  - Continue using:
    - `confidence` (text match)
    - global popularity (from `search_log`)
    - user affinity (from `search_log`)
    - favorites (already implemented)
  - Add: `viewAffinity` (restaurants only) sourced from `user_restaurant_view`:
    - Example scoring (tunable):
      - `recency = exp(-daysSinceLastViewed / 7)`
      - `count = min(viewCount, 10) / 10`
      - `viewAffinity = 0.7 * recency + 0.3 * count`
      - `score += viewAffinity * 0.08` (keep small)

## Collection priority / on-demand (apps/api)

### On-demand collection
- Keep existing behavior: on-demand triggers only from low-result searches with entity targets.
- Do **not** trigger on-demand from restaurant views.

### Scheduled/priority enrichment (optional, phase 2)
If/when you want user interactions to affect enrichment priority:
- Use `EntityPriorityMetric.queryImpressions` as the primary demand input (already recorded).
- Add a restaurant-only tie-breaker from views:
  - Option A: aggregate from `user_restaurant_view` (sum viewCount), but this can be heavy at runtime.
  - Option B (recommended): on each view, increment a new `EntityPriorityMetric.viewImpressions` column and set `lastViewAt`. This keeps priority selection fast.
- Keep favorites as a very small tie-breaker (favorites are “taste”, not “coverage gap”).

## Backfill / Migration

### Prisma migrations
- Add the new `SearchLog` fields + indexes.
- Add `UserRestaurantView`.

### Backfill (optional)
- `searchRequestId` for existing `search_log` can remain null (analytics can treat null rows as legacy).
- No backfill needed for `user_restaurant_view` initially.

## Testing + QA (no dashboards)

### API tests (Jest)
- Search logging:
  - Writes `searchRequestId` and `totalResults` onto each `search_log` row for a successful search.
  - Respects “no targets ⇒ no rows”.
- Views:
  - Upsert increments `viewCount` only when outside cooldown.
  - GET returns ordered list with joined restaurant fields.
- Autocomplete boost:
  - A recently viewed restaurant receives a measurable (but capped) ordering boost vs an otherwise tied candidate.

### Mobile QA checklist
- Focusing search shows both “Recently viewed” and “Recent searches”.
- Opening a restaurant overlay adds it to “Recently viewed” and reorders by recency.
- Autocomplete does not become “all restaurants all the time” (boost is subtle).

## Rollout / Safety
- Feature flag the autocomplete view boost (server-side), so you can tune weights without shipping a new app.
- Cap list sizes and apply cooldown to avoid abusive event spam.

## Open questions (answer before implementation)
- Do we want views to be counted when the overlay auto-opens from a “single restaurant candidate” search?
- What’s the desired retention window for “recently viewed” (e.g., last 50 restaurants)?
- Do we want “recent searches” to include searches that resolve to targets but return 0 results (today it will)?
