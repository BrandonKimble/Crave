# Map Marker LOD v3 (Global Quality Score Mode + Shortcut Coverage Snapshot)

This plan replaces/overhauls `plans/map-marker-lod-v2.md` to match the newer “pins + labels as SymbolLayers” architecture and the shortcut coverage snapshot flow.

## Goals

### All search flows (restaurants + dishes)

- **Snapshot semantics**: a search uses the viewport bounds (or location constraint) at submit-time. No refetch until user explicitly re-searches (“Search this area” / submit).
- **LOD**: map renders a mix of _full pins_ (top N) + _dots_ (the rest) with **snap** transitions (no animation yet).
- **Global scoring mode (default)**:
  - UI score is **global quality score** (0–100, 1 decimal).
  - Map color derives from global quality score (stable across sessions if the score is unchanged).
  - Ordering/top-N selection uses global quality score.
- **Coverage-scoped mode remains available behind a flag** for later evaluation:
  - Uses `core_display_rank_scores` (`displayScore`/`displayPercentile`) as the primary ranking/color signal.

### Shortcut button flows (special case)

- **Dataset acquisition**: loads “all candidates in bounds” up front for map (dots), and paginated list for the sheet.

### Typical (free text) search flows (special case)

- **Dataset acquisition**: map population grows progressively with pagination:
  - Page 1 loads (e.g.) 20 results → all render as pins initially.
  - As pages accumulate, we keep adding to the map dataset; once the dataset is “too many”, LOD keeps only top N as pins while the remainder become dots.
  - As the user continues to paginate, more dots get added.

## Non-goals (for this iteration)

- No clustering / dot splitting.
- No “fancy” pin↔dot transitions (snap only).
- No “fancy” pin↔dot collision tuning yet (pins may overlap; we’re not doing clustering/packing heuristics).
- No edge culling / offscreen fade behavior (SymbolLayers are efficient; revisit later if needed).

## Current architecture anchors (important context)

- Labels are Mapbox `SymbolLayer`s with 4 candidates + a mutex icon + sticky locking (see `plans/map-marker-lod-v2.md` and `apps/mobile/src/screens/Search/components/search-map.tsx`).
- Pins are also `SymbolLayer`s (stacked sublayers for the pin art).
- Shortcut coverage map call returns a GeoJSON FeatureCollection of restaurant points within viewport bounds (used to render dots for “all restaurants” independent of list pagination).

## Score glossary (what’s global vs coverage-scoped)

### Global (not coverage-scoped)

- Restaurant: `restaurantQualityScore` (0–100)
- Dish/connection: `foodQualityScore` (0–100)

These are computed by quality-score processing and are intended to be comparable across the dataset.

### Coverage-scoped (by `locationKey`)

- Restaurant: `displayScore` and `displayPercentile` from `core_display_rank_scores`
- Dish/connection: `displayScore` and `displayPercentile` from `core_display_rank_scores`

These are computed via `PERCENT_RANK() OVER (PARTITION BY location_key ...)`, so each coverage can have its own “top” restaurant at/near 100th percentile.

## Proposed implementation (Phase-based)

## Current status (as of 2026-02-05)

Completed:

- ✅ **API `scoreMode` end-to-end (ordering + metadata)** for natural + structured searches.
- ✅ **Shortcut coverage map endpoint** returns (a) global restaurant score + (b) coverage percentile, and supports `includeTopDish` for dish-tab shortcut pins.
- ✅ **Mobile cards + colors** are `scoreMode` aware (global vs coverage).
- ✅ **Live LOD while moving**: top **30** visible candidates render as pins; remainder are dots.
- ✅ **Deterministic pin stacking under LOD** via fixed “z-slot” SymbolLayer stacks (prevents “newly mounted pin draws on top”).
- ✅ **Dots/pins mutual exclusion**: dots are hidden under pinned restaurants using a property-based expression (not feature-state).
- ✅ **Pins require `googlePlaceId`**:
  - Shortcut coverage: filtered server-side (`pl.google_place_id IS NOT NULL`).
  - Normal search pins: filtered client-side (skip locations without `googlePlaceId`) to prevent “73 restaurants at one coordinate” stacks.
- ✅ **Label flash on gesture end**: removed the forced label-layer remount that caused all labels to blink when releasing the map.
- ✅ **LOD boundary hysteresis**: added per-marker promote/demote stability gating to reduce 30/31 flip-flop while moving.

Not completed / still open:

- ⏳ **True label ordering invariance** while moving (we accept that collision + candidate layers can reorder).
- ⏳ **Fine-tuning for LOD hysteresis constants** if it still feels “indecisive” in very dense areas.

### Phase 0 — Flag & invariants

**Add a single “score mode” switch** that controls score display + ordering + map colors consistently.

Recommended enum:

- `global_quality` (default)
- `coverage_display` (fallback/alt)

Invariants:

- The mode is chosen when the search is submitted and is tied to the search/session request id (no mid-session flips).
- All components (cards, pins, dots, labels/diagnostics) read from a single “score selector” helper.

---

### Phase 1 — API returns global scores everywhere (restaurants + dishes)

Ensure all relevant endpoints return the global score needed for display + color + ordering.

API changes:

- Restaurant results should include `restaurantQualityScore` (global).
- Dish results should include `qualityScore` / `foodQualityScore` (global).
- Shortcut coverage GeoJSON (`POST /search/shortcut/coverage`) feature `properties` should include:
  - `restaurantQualityScore` (number, 0–100)
  - optionally keep `displayPercentile` (for the alternate mode)

Notes:

- Keep payload lean: we don’t need votes/mentions for this call unless we choose to use them as tie-breakers.
- We expect no missing scores for returned entities (restaurants without dishes should not appear). If this is not guaranteed today, enforce it at query time.

Acceptance:

- Mobile can compute pin/dot color from global quality score (global mode).
- Mobile can compute a stable ordering key from global quality score (global mode).

---

### Phase 2 — End-to-end score mode (API ordering + response shape)

Make the flag truly end-to-end: the API should order using the same score signal the client displays/colors with.

Target behavior (global mode):

- Restaurant list ordering: `restaurantQualityScore DESC` (+ stable tie-breaker)
- Dish list ordering: `foodQualityScore DESC` (+ stable tie-breaker)

Mode gating options (pick one):

1. **Request parameter (recommended)**: pass `scoreMode` on search endpoints; API chooses ORDER BY accordingly.
2. **Server default**: default to global ordering; keep coverage ordering as an opt-in later.

Acceptance:

- Page 1 ordering matches “top N pins” selection logic.
- Pagination does not reshuffle earlier results (stable tie-breakers).

---

### Phase 3 — Mobile score display + color mapping (global mode)

Implement a single set of helpers that:

- choose the primary score based on `scoreMode`
- format it as 0–100 with 1 decimal
- compute marker/dot/label colors consistently

Mobile changes:

- Add `getRestaurantPrimaryScore(restaurant, scoreMode)` and `getDishPrimaryScore(dish, scoreMode)`.
- Add `getQualityColorFromScore(score0To100)` (maps 0–100 into the existing gradient).
- Replace remaining `displayScore ?? restaurantQualityScore` fallbacks in cards with the mode-aware selector.

Acceptance:

- Cards show `restaurantQualityScore` (global mode), not `displayScore`.
- Dots and pins match card colors for the same restaurant.

---

### Phase 4 — LOD switching (snap dot↔pin) shared by both flows

Implement one LOD engine that works for:

- shortcut flows (dataset is loaded up-front), and
- typical flows (dataset grows as pages are fetched).

Data model:

- Every search produces a dataset of “map candidates” (restaurants for restaurant searches; restaurant-locations for dish searches).
- Candidate acquisition differs by flow:
  - Shortcut: map candidates arrive mostly in one burst.
  - Typical: map candidates accumulate as the user paginates.
- Each dataset is tied to `searchRequestId` and `scoreMode`.

Algorithm:

1. Maintain a **stable ranking key** per candidate within the current `searchRequestId` dataset:
   - global mode: full-precision `restaurantQualityScore DESC`
   - coverage mode: `displayPercentile DESC` (or `displayScore DESC` if we prefer)
   - tie-break: see “Open questions”
2. Define `MAX_FULL_PINS` as a tunable constant (start at **30**).
3. On camera change (zoom/pan), determine which candidates are currently within viewport bounds.
4. Promote the **top `MAX_FULL_PINS` among the visible subset** to full pins; render the rest as dots.
5. On dataset growth (pagination adds more candidates), recompute ranking maps once, then re-run step (4).

Important: this does **not** refetch; it only re-evaluates visibility + chooses which markers are “pins”.

Acceptance:

- Zooming in increases the density of pins (more candidates become “top N among visible”).
- Panning without re-search keeps the same snapshot ranking (only visibility changes).
- Paginating the sheet does not churn the map’s pin set (pins are derived from snapshot ordering, not “current page”).

### Phase 4a — “Live while moving” requirement (no idle-only snapping)

Dot↔pin promotion/demotion must work **while the map is being manipulated** (panning/zooming), not only after idle.

Implementation notes:

- Trigger LOD recomputation from camera-change events (the same class of events that currently drive dot visibility).
- Throttle to a small cadence while moving (e.g., once per animation frame or every ~50–100ms) to avoid saturating JS.
- Keep Mapbox layers stable; prefer updating ShapeSource data / feature-state instead of unmounting/remounting layers while moving.
- Optional: small hysteresis to avoid “rank 30/31” flicker (tunable) without waiting for idle.

---

## Phase 5 — Global vs Local ranking toggle (UX + perf)

Goal: add a UI toggle (left of the dishes/restaurants segment toggle) that lets the user switch between:

- **Global** ranking (quality score)
- **Local** ranking (coverage percentile / display score)

Desired UX:

- Switching feels like a UI toggle (instant or near-instant), without “submit new search” friction.
- Map pins/dots/labels update smoothly while moving (no big remount flashes).
- List ordering updates consistently with the map ordering.

### Key design decision: “view switch” vs “new search”

There are two viable strategies; which one we choose determines correctness vs instantness:

**Option A (recommended v1): view-only toggle, no refetch**

- Toggle only changes **how we rank / color / display** within the already-loaded dataset.
- Pros: instant; feels like a “display mode” switch.
- Cons: if the user has not loaded all pages, the list cannot be “globally correct” for the alternate mode (because pagination was fetched using the other ordering).

How to keep it correct enough:

- On toggle:
  - Recompute the “rank key” per item from existing fields:
    - restaurants: global => `restaurantQualityScore`; local => `displayScore` or `displayPercentile * 100`
    - dishes: global => `qualityScore`; local => `displayScore` or `displayPercentile * 100`
  - Resort the *currently loaded* arrays for the sheet and rebuild marker ranks accordingly.
- Keep API pagination stable:
  - Latch `scoreModeAtSubmit` per search session and keep all API calls for that session using that mode (prevents duplicates/skips).
  - The toggle affects only the client-side ordering view for that session.

**Option B: toggle triggers a new search (refetch page 1)**

- Toggle behaves like Open Now (but likely faster), resetting to page 1 under the new ordering.
- Pros: list ordering is *actually correct* for the selected mode from the start.
- Cons: not “friction free”; requires network; may feel like a new search.

Hybrid (best UX, more work):

- Do Option A immediately (instant resort of loaded data), then background fetch Option B and swap in when ready.
- Requires careful UI so results don’t “snap twice” confusingly.

### Recommended implementation approach (Option A)

Core principle: the toggle should not require unmounting Mapbox layers; it should flow through existing memoization.

1) Introduce a single `scoreModePreference` state in `SearchScreen` (default `global_quality`).
2) Use `scoreModePreference` for:
   - card display score selection
   - card + marker colors
   - marker ranking + `rank` assignment (drives label sort priority + pin stacking slots + LOD selection)
3) Keep `scoreModeAtSubmit` (latched when search is submitted) to avoid changing API pagination ordering mid-session.
4) Refactor to make “ordering” a pure function:
   - `getRestaurantRankValue(restaurant, mode)`
   - `getDishRankValue(dish, mode)`
   - `getRestaurantColor(restaurant, mode)`
   - `getDishColor(dish, mode)`
5) Ensure the toggle only invalidates the minimal memo sets:
   - resorted restaurant/dish arrays
   - marker catalog / pinned set
   - dot color expressions + pin colors
   - avoid bumping label epochs (no forced remount).

### UI placement

- Add the toggle to `apps/mobile/src/screens/Search/components/SearchFilters.tsx` as a compact two-state control (Global/Local) immediately left of the existing segment toggle.
- Keep the existing segment highlight animations; the new toggle should be visually “first-class” but small.

### Open questions / decisions needed

- Should the toggle affect:
  - only ordering + color + score display, or
  - also which sections/meta copy we show (e.g., disclose “local mode uses coverage percentile”)?
- What to label it:
  - “Global / Local”
  - “US / City”
  - “Overall / Nearby”
- Should the selection persist across app launches (AsyncStorage), or be session-only?

## “Done” checklist

- Shortcut coverage map returns global score.
- Shortcut list uses global score ordering in global mode.
- Map + cards use a single score selector and produce consistent colors.
- LOD logic yields stable top N pins from snapshot dataset (no map churn on pagination).

## Likely code touch points (implementation map)

### API

- Shortcut coverage GeoJSON: `apps/api/src/modules/search/search-coverage.service.ts`
- Shortcut controllers/DTOs: `apps/api/src/modules/search/search.controller.ts`, `apps/api/src/modules/search/dto/*`
- Shortcut list ordering (restaurants/dishes): `apps/api/src/modules/search/search-query.builder.ts`, `apps/api/src/modules/search/search-query.executor.ts`, `apps/api/src/modules/search/search.service.ts`
- Score provenance docs: `apps/api/src/modules/content-processing/quality-score/quality-score.service.ts`, `apps/api/src/modules/content-processing/rank-score/rank-score.service.ts`, `apps/api/prisma/schema.prisma` (`core_display_rank_scores`, `restaurant_quality_score`, `food_quality_score`)

### Mobile

- Map dots/pins SymbolLayers: `apps/mobile/src/screens/Search/components/search-map.tsx`
- Shortcut submit + request id semantics: `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`, `apps/mobile/src/services/search.ts`
- Shortcut list/map state glue + current “dot heavy mode” logic: `apps/mobile/src/screens/Search/index.tsx`
- Color helpers: `apps/mobile/src/screens/Search/utils/quality.ts`, `apps/mobile/src/screens/Search/utils/marker-lod.ts`
- Card score display: `apps/mobile/src/screens/Search/components/restaurant-result-card.tsx`, `apps/mobile/src/screens/Search/components/dish-result-card.tsx`

## Open questions (need decisions before implementation)

### 1) Top N pin count

- Fixed number (e.g., 35/50/75/100), or scale by device size?
- Separate counts per shortcut type (restaurants vs dishes)?
  Decision (v1):
- Fixed and tunable; start at `MAX_FULL_PINS = 30`.
- Always compute top-N over the **currently visible subset** (viewport-relative).

### 2) Tie-breaker for identical scores (global mode)

Options (in order of simplicity):

1. `restaurantId ASC` (stable, cheap, but not “best” among equals)
2. Use **full-precision** quality score for ordering (DB stores decimals) and only round to 1 decimal for display (reduces ties without extra joins)
3. `totalUpvotes DESC, mentionCount DESC, restaurantId ASC` (more meaningful, requires extra fields for coverage dataset)
4. `distanceMiles ASC` (only meaningful if we define “center” distance; also changes with viewport)

Recommendation for v1:

- Order by full-precision quality score, then `restaurantId` (cheap + stable); revisit votes/mentions later if needed.

### 3) Restaurants with missing scores

- We expect “no missing score” for returned restaurants/dishes. Confirm and enforce at query time if needed.

### 4) Dish-search marker semantics

Decision (v1):

- Dish searches stay “one marker per restaurant”.
- The restaurant marker label uses the **top dish for that restaurant** (highest-rated among the dishes returned for that restaurant in the current search).

### 5) Score rounding

- Always show `toFixed(1)` on 0–100 scale (including “100.0”)?
- Any special-case for null/undefined scores?

### 6) Should we ship LOD in the same PR as the score-mode switch?

Recommendation:

- Yes, but as 2 sequential commits/PR steps:
  1. global score mode end-to-end (API + card + color)
  2. LOD switching (snap dot↔pin) using the same score selector

This keeps debugging crisp and avoids conflating “color/score correctness” with “LOD correctness”.
