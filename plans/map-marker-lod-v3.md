# Map Marker LOD v3 (Global Quality Score Mode + Shortcut Coverage Snapshot)

> Superseded scoring note: this plan predates the Crave Score cutover. Any
> references below to global raw quality, coverage-scoped display rank scores,
> percentiles, or local/global score toggles are stale. Map pins/cards should
> consume stable `craveScore` from `core_public_entity_scores`; viewport context
> should only affect rank and which candidates are visible.

This plan replaces/overhauls `plans/map-marker-lod-v2.md` to match the newer “pins + labels as SymbolLayers” architecture and the shortcut coverage snapshot flow.

## Goals

### All search flows (restaurants + dishes)

- **Snapshot semantics**: a search uses the viewport bounds (or location constraint) at submit-time. No refetch until user explicitly re-searches (“Search this area” / submit).
- **LOD**: map renders a mix of _full pins_ (top N) + _dots_ (the rest) with **snap** transitions (no animation yet).
- **Crave Score mode**:
  - UI score is stable `craveScore`.
  - Map color derives from `craveScore` through the shared continuous color curve.
  - Ordering/top-N selection uses the tab-native Crave Score subject.
- Coverage-scoped score modes are removed from the current direction; viewport
  context only changes rank and visibility.

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

## Score glossary

This section has been updated for the Crave Score cutover. The old
coverage-scoped display-rank score model is no longer an implementation path.

- Restaurant cards/pins use stable restaurant `craveScore` from
  `core_public_entity_scores`.
- Dish cards/pins use stable connection `craveScore` from
  `core_public_entity_scores`.
- Viewport/search context changes which rows are visible and their ordinal rank;
  it does not recompute the score or color.

Any remaining references below to score toggles, raw quality scores, or
percentiles are historical notes, not executable guidance.

## Proposed implementation (Phase-based)

## Current status (as of 2026-02-07)

Completed:

- ✅ **API `scoreMode` end-to-end (ordering + metadata)** for natural + structured searches.
- ✅ **Shortcut coverage map endpoint** returns (a) global quality scores + (b) coverage-scoped `displayScore`, and supports `includeTopDish` for dish-tab shortcut pins.
- ✅ **Mobile cards + colors** are `scoreMode` aware (global vs local `displayScore`).
- ✅ **Live LOD while moving**: top **30** visible candidates render as pins; remainder are dots.
- ✅ **Deterministic pin stacking under LOD** via fixed “z-slot” SymbolLayer stacks (prevents “newly mounted pin draws on top”).
- ✅ **Dots/pins mutual exclusion**: dots are hidden under pinned restaurants using a property-based expression (not feature-state).
- ✅ **Pins require `googlePlaceId`**:
  - Shortcut coverage: filtered server-side (`pl.google_place_id IS NOT NULL`).
  - Normal search pins: filtered client-side (skip locations without `googlePlaceId`) to prevent “73 restaurants at one coordinate” stacks.
- ✅ **LOD boundary hysteresis**: added per-marker promote/demote stability gating to reduce 30/31 flip-flop while moving.
- ✅ **Label order stabilization (pragmatic)**:
  - Stable `markerKey` ids are assigned for label features.
  - `labelOrder` is injected and used for stable `symbolSortKey`.
  - This improves ordering determinism, though Mapbox collision can still cause placement-level variation.
- ✅ **Gesture-end label flash mitigation**:
  - Steady-state sticky-label refresh avoids forced SymbolLayer remounts.
  - This reduced label disappear/reappear behavior during normal camera idle transitions.

Implemented with slightly different shape than originally written:

- ℹ️ **Single score-selector helper** was implemented as mode-aware inline selectors in cards/marker construction (same behavior, different structure).
- ℹ️ **Score mode toggle strategy** shipped as Option B (re-run search under new ordering), not instant local resort (Option A).

Still open:

- ⏳ **Pin↔dot transition animations** (fade/morph) are still not implemented; transitions are snap-only.
- ⏳ **Absolute label ordering invariance** is not guaranteed across every Mapbox collision pass.
- ⏳ **`scoreMode` cold-start persistence** is incomplete (stored in Zustand state, but not currently included in persisted partialization).
- ⏳ **Further hysteresis tuning** in very dense areas may still be beneficial.

### Phase 0 — Flag & invariants

**Add a single “score mode” switch** that controls score display + ordering + map colors consistently.

Recommended enum:

- `global_quality` (default)
- `coverage_display` (fallback/alt)

Invariants:

- The mode is chosen when the search is submitted and is tied to the search/session request id (no mid-session flips).
- All components (cards, pins, dots, labels/diagnostics) read from a single “score selector” helper.

---

### Phase 1 — API returns Crave Scores everywhere (restaurants + dishes)

Ensure all relevant endpoints return the stable Crave Score needed for display,
color, and ordering.

API changes:

- Restaurant results include numeric `craveScore` from
  `core_public_entity_scores` for the restaurant subject.
- Dish results include numeric `craveScore` from
  `core_public_entity_scores` for the connection subject.
- Shortcut coverage GeoJSON (`POST /search/shortcut/coverage`) feature `properties` should include:
  - `craveScore` (number, stable public score)
  - `scoreSubjectType` / `scoreSubjectId`
  - `restaurantCraveScore` for dish pins

Notes:

- Keep payload lean: we don’t need votes/mentions for this call unless we choose to use them as tie-breakers.
- We expect no missing scores for returned entities (restaurants without dishes should not appear). If this is not guaranteed today, enforce it at query time.

Acceptance:

- Mobile can compute pin/dot color from stable `craveScore`.
- Mobile can compute a stable ordering key from stable `craveScore`.

---

### Phase 2 — End-to-end score mode (API ordering + response shape)

Make the flag truly end-to-end: the API should order using the same score signal the client displays/colors with.

Target behavior:

- Restaurant list ordering: restaurant `craveScore DESC` (+ stable tie-breaker)
- Dish list ordering: connection `craveScore DESC` (+ stable tie-breaker)
- There is no local/global score toggle in the current Crave Score direction.

Acceptance:

- Page 1 ordering matches “top N pins” selection logic.
- Pagination does not reshuffle earlier results (stable tie-breakers).

---

### Phase 3 — Mobile score display + color mapping (global mode)

Implement a single set of helpers that:

- choose the tab-native `craveScore`
- format it as a degree score with 1 decimal unless `.0`
- compute marker/dot/label colors consistently

Mobile changes:

- Use `getCraveScoreColorFromScore(score)` for cards, pins, and dots.
- Do not keep `displayScore`, raw-quality, or result-index color fallbacks.

Acceptance:

- Cards show stable `craveScore`.
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
- Each dataset is tied to `searchRequestId`; score values remain stable for the
  subject until the next public score rebuild.

Algorithm:

1. Maintain a **stable ranking key** per candidate within the current `searchRequestId` dataset:
   - restaurant tab: restaurant `craveScore DESC`
   - dish tab: connection `craveScore DESC`
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

## Phase 5 — Removed local/global ranking toggle

The old local/global score toggle is no longer a product direction. Search
context controls which candidates are visible and their ordinal rank. It does
not switch score semantics or recolor the same subject by viewport.

Historical toggle notes below are obsolete and should not be implemented.

**Historical Option B: toggle triggers a new search (refetch page 1)**

- Toggle behaves like Open Now (but likely faster), resetting to page 1 under the new ordering.
- Pros: list ordering is _actually correct_ for the selected mode from the start.
- Cons: not “friction free”; requires network; may feel like a new search.

Hybrid (best UX, more work):

- Do Option A immediately (instant resort of loaded data), then background fetch Option B and swap in when ready.
- Requires careful UI so results don’t “snap twice” confusingly.

### Implemented approach (Option B v1)

Core principle: the toggle flows through the same memoization paths as other filters, and re-runs the active search with the selected mode.

1. Store `scoreMode` in `useSearchStore` (default `global_quality`).
2. Plumb `scoreMode` through:
   - card display scores (local uses `displayScore` only)
   - marker colors (local uses `displayScore` only)
   - shortcut coverage dot fetch (`scoreMode` request param)
3. On toggle:
   - update the current preference in store
   - rerun the current search (shortcut => `runBestHere`, natural => `submitSearch`) with `preserveSheetState: true`
   - reset to page 1 under the new ordering (keeps pagination correct).

Future improvement (if we want “instant”):

- Add Option A (view-only resort of loaded data) as a fast path, and optionally background-fetch Option B to reconcile.
- Persist `scoreMode` across cold starts if we want the mode to survive app relaunch.

### UI placement

- Add the toggle to `apps/mobile/src/screens/Search/components/SearchFilters.tsx` as a compact two-state control (Global/Local) immediately left of the existing segment toggle.
- Keep the existing segment highlight animations; the new toggle should be visually “first-class” but small.

### Open questions / decisions needed

- Labeling: “Global / Local” vs “Overall / Nearby” (we can iterate).
- Copy: whether to disclose that local mode is coverage-scoped (e.g., in meta line / score info sheet).

## “Done” checklist

- ✅ Shortcut coverage map returns global + coverage score fields (and top-dish metadata for dish mode).
- ✅ Shortcut list and natural search honor `scoreMode` ordering from API.
- ✅ Map + cards are mode-aware and keep color/score presentation aligned.
- ✅ LOD logic yields stable top-N pins from the snapshot dataset with live camera updates.
- ✅ Deterministic pin z-order under LOD is in place.
- ⏳ Pin↔dot animation transitions are not implemented (snap only).
- ⏳ True absolute label ordering invariance is not fully guaranteed.
- ⏳ `scoreMode` persistence across app relaunch is not complete.

## Likely code touch points (implementation map)

### API

- Shortcut coverage GeoJSON: `apps/api/src/modules/search/search-coverage.service.ts`
- Shortcut controllers/DTOs: `apps/api/src/modules/search/search.controller.ts`, `apps/api/src/modules/search/dto/*`
- Shortcut list ordering (restaurants/dishes): `apps/api/src/modules/search/search-query.builder.ts`, `apps/api/src/modules/search/search-query.executor.ts`, `apps/api/src/modules/search/search.service.ts`
- Score provenance docs: `apps/api/src/modules/content-processing/public-crave-score/public-crave-score.service.ts`, `apps/api/prisma/schema.prisma` (`core_public_entity_scores`)

### Mobile

- Map dots/pins SymbolLayers: `apps/mobile/src/screens/Search/components/search-map.tsx`
- Shortcut submit + request id semantics: `apps/mobile/src/screens/Search/hooks/use-search-submit.ts`, `apps/mobile/src/services/search.ts`
- Shortcut list/map state glue + current “dot heavy mode” logic: `apps/mobile/src/screens/Search/index.tsx`
- Color helpers: `apps/mobile/src/screens/Search/utils/quality.ts`, `apps/mobile/src/screens/Search/utils/marker-colors.ts`
- Card score display: `apps/mobile/src/screens/Search/components/restaurant-result-card.tsx`, `apps/mobile/src/screens/Search/components/dish-result-card.tsx`

## Open items (remaining)

1. Implement smooth pin↔dot visual transitions (fade/morph) while preserving current LOD stability and z-order guarantees.
2. Decide whether we need stronger label ordering guarantees than current `labelOrder` + sticky-candidate stabilization.
3. Persist `scoreMode` through cold start if we want user preference retention after app relaunch.
4. Continue tuning hysteresis constants if dense-map behavior still feels indecisive.
5. Consider Option A/Hybrid toggle UX (instant client-side resort + background reconciliation) if Option B feels too network-bound.
