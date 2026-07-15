# Viewport-Only Search + Location-Centric Interaction — Execution Plan

Status: DRAFT for owner ratification (2026-07-14). Supersedes the market-scoped result
filter established in the Apr-2026 coverage cutover (plans/polls-coverage-resolution-cutover-plan.md,
now historical for that aspect).

## Governing principles (ratified in the 2026-07-14 session)

1. **The viewport IS the geographic query.** No market filter on ranked results or
   coverage dots. Market survives only as: metadata (display name), attribution,
   demand/collection scope, poll bucket, entity-linking recall scope, score provenance.
2. **Restaurant = unit of data (score, dishes, reputation). Location = unit of
   interaction (tap, view, save, directions).** Google separates at the data layer;
   we separate at the interaction layer and keep the entity model intact.
3. **Reads never write.** Searching/browsing never creates markets. (Poll creation's
   mint also becomes unnecessary once markets are pre-seeded — Leg 5.)
4. **Search observes; the scheduler judges.** Demand recording is unconditional
   observation (per-market counts); deficiency judgment lives in the collection
   ranker with cross-market context. No hardcoded thresholds at search time.
5. **No silent truncation.** Caps that lie (50k coverage LIMIT) are deleted; input
   validation lives at the DTO boundary, not mid-service.
6. **No backwards compatibility.** Pre-launch: favorites/history data is throwaway;
   hard cutovers, no fallback paths, no migration remediation. locationId/placeId is
   always available at write time.

---

## Leg 1 — Viewport-only cutover (search + coverage)

### 1.1 Ranked results
- DELETE the market EXISTS clause in `buildLocationConditions`
  (apps/api/src/modules/search/search-query.builder.ts ~L907–937). Applies to both
  restaurant (L181) and dish (L495) paths. Viewport polygon/bbox conditions unchanged.
- `buildExecutionDirectives` (search.service.ts ~L1881): `hasActiveMarketKey` is one of
  three reasons directives exist. Delete the activeMarketKey threading deliberately —
  the row market_key stamp dies with it (wanted: Leg 2 removes its last consumer).
- Response `metadata.marketKey` / `displayMarketName` / attribution / collectable keys:
  unchanged (resolution stays, filter goes).

### 1.2 Coverage dots
- DELETE `marketLocationFilterSql` + dto `marketKey` field
  (search-coverage.service.ts ~L211–232; ShortcutCoverageRequestDto).
- DELETE `maxRestaurants = 50000` LIMIT (L181/L310). Query remains bounded by
  viewport + eligibility. (Future scale: zoom-aware thinning designed on purpose.)
- **Deploy order (lockstep trap):** mobile sends `marketKey` as a REQUIRED field
  (shortcut-coverage-world.ts L174–186; services/search.ts L726–748). Ship API
  accepting-and-ignoring first → mobile drop → API dto delete. A forbid-unknown pipe
  with a premature dto delete 400s every coverage call (zero-dots regression).
- Mobile: drop marketKey from the coverage fetch + requestKey segment (~L91, ~L194);
  collapse the known/unknown-market branch in search-world-fetch.ts (~L125–157) so
  coverage ALWAYS fetches in parallel with cards (first-submit latency win).
- **Coverage dots become one-per-LOCATION**: drop `DISTINCT ON (cl.restaurant_id)`
  in `selected_locations` (search-coverage.service.ts L262–276) so every eligible
  location in view is a dot. Consistency with location-centric interaction (Leg 2)
  and with the See-locations mode. Feature id becomes restaurantId-locationId.

### 1.3 Page-size validation
- Move page-size bound to the request DTO (`@Max(100)` on pageSize,
  dto/search-query.dto.ts); DELETE the in-service clamp constants + resolvePagination
  clamping (search.service.ts L83–84, ~L3437–3452 clamp arm; keep default-25 fallback).

### 1.4 Market-label purge (dead UI + server round-trip)
- Mobile DELETE list: dish-result-card.tsx L58–59/74–75/107–110/245–249;
  restaurant-result-card.tsx L73–74/91–92/130–134/304/425–435;
  restaurant-result-card-descriptor.ts L34/L159–171/L191–193/L211;
  render-meta-detail-line.tsx marketLabel param + branch (KEEP the locationCount
  chip path until Leg 2 replaces it); utils/format.ts L6–30;
  use-search-results-panel-card-market-runtime.ts primaryMarketKey half (keep
  primaryFoodTerm/searchRequestId halves);
  use-search-results-panel-card-render-runtime.tsx plumbing;
  search-mounted-results-data-store.ts L1242–1263 primaryMarketKey/showMarketLabel.
- Server DELETE: `attachMarketNames` + `resolveMarketName` + call site
  (search-query.executor.ts L466, L542–654 — removes a market.findMany round-trip
  per search); marketName:null seeds (executor L2220/L2305; search.service
  L1436/L1722); `marketName` on FoodResult/RestaurantResult/DishResult in
  packages/shared. (displayMarketName on resolution metadata is NOT this — keep.)

### 1.5 Notice copy
- On-demand notice: name the market when exactly one collectable market is in play,
  "this area" when several (use-search-results-panel-on-demand-notice-runtime.tsx).

Verification: RED-prove the filter deletion (a cross-market fixture restaurant absent
before, present after); EXPLAIN whole-world bbox stays flat (~28–44ms baseline);
coverage parallel-fetch timing on first submit; label purge = tsc + visual sweep.

---

## Leg 2 — Location-centric interaction pivot

### 2.1 Selection = one location
- Tapping a pin selects THAT location only. DELETE sibling force-promotion: the
  highlightedMarkerKeys computation (search-map.tsx L1634–1676) collapses to the
  single tapped markerKey; read-model `shouldRenderAllLocations` branch +
  invisibleResident emission for selection purposes (map-read-model-builder.ts
  L157–197) deleted. Native engine untouched (forcedKeys just gets one key).

### 2.2 Representative pin = where the fame is
- For a multi-location restaurant's ONE ranked pin: prefer locations inside the
  restaurant's `scoring_market_key` (already stamped on the score row), tiebreak
  closest-to-anchor. Replaces closest-to-viewport-center arbitrariness. Server
  display-location DISTINCT ON ordering gains the scoring-market preference;
  client representative selection (restaurant-location-selection.ts) mirrors it.
  (is_primary is NOT usable: 146/532 multi-location restaurants have 2+ primaries.)

### 2.3 Profile = restaurant data + the tapped address
- Profile shows the in-context location's address/hours/phone (tapped pin's, card's
  display location, or recently-viewed address). DELETE the multi-location expandable
  list in RestaurantPanel.tsx and the `?marketKey=` scoping end-to-end:
  getRestaurantProfile market filter (search.service.ts ~L1599–1687,
  listRestaurantLocationIdsInMarket L1761–1797), controller param, mobile
  profile-open/preview/seed/hydration marketKey plumbing + cache key
  (profile-mutable-state-record.ts) → cache keyed (restaurantId, locationId).
  Profile fetch takes locationId; response carries that location.
- This also deletes the row-level market_key SELECT stamps (builder L264/310/585/625;
  search.service L1388) — last consumer gone.

### 2.4 Result payload slimming
- DELETE `locations_json`/`location_count` + `buildLocationAggregatesCte`
  (search-query.builder.ts L1541–1629) and their executor/DTO fields. Result rows
  carry ONE display location (as today) + its locationId.

### 2.5 See-locations mode
- Autocomplete chip: "See locations" (no count). Tapping it runs a dedicated search
  mode: all locations of that restaurant within the current viewport, each a pin
  (normal 30-budget LOD applies), tap → 2.1/2.3 behavior. Server: new lean query
  (restaurantId + viewport → locations); reuses the search world/scene plumbing as a
  variant lane. DELETE autocomplete locationCount plumbing (autocomplete.service.ts
  L404–446 count attach; statusPreview.locationCount) once the chip stops needing it.

### 2.6 Favorites save a location
- Schema: add `locationId` to UserFavorite + FavoriteListItem (NOT nullable-forever —
  required going forward; existing rows are throwaway, hard cutover, no backfill).
- Save flows pass the in-context locationId. List-detail search flow renders ONLY the
  saved location (no multi-location expansion on the lists map).
  (ListDetailPanel.tsx:509 comment context.)

### 2.7 Recently-viewed = specific addresses, earned suggestions
- History records (entityId, locationId, address label). Recently-viewed rows render
  "Torchy's Tacos — S 1st St". Autocomplete rule: visited locations may appear as
  suggestion rows BENEATH their restaurant's catch-all row; addresses never appear
  cold. Catch-all row may carry a "nearest: <street>" subtitle (display-only).

Verification: sim finger-test matrix (tap chain pin at city + US zoom; save location →
list detail shows one pin; See-locations for Chick-fil-A over Texas; profile address =
tapped address in every entry path). RED: profile fetch with mismatched stale key
must be impossible by construction (no market/key param left to mismatch).

---

## Leg 3 — Demand ideal shape (observe → judge)

### 3.1 Per-market observation, market-wide measurement
- On food-entity searches, record per collectable market intersecting the viewport:
  (term, marketKey, market-wide result count for the term — counted against the
  MARKET polygon, not the viewport slice). Unconditional recording (no zero-only
  trigger, no thresholds at search time): search observes, scheduler judges.
- DELETE `shouldTriggerOnDemand` zero-gate + `ON_DEMAND_MIN_RESULTS` +
  the 1.7-mile viewport gate (`isViewportEligibleForOnDemand`, both duplicate sites,
  on-demand-tuning.constants.ts) — the market-wide count makes the neighborhood
  noise-filter obsolete by answering the real question directly.
- Keep the (term × market) ledger row shape + 5-min cooldown + ask events; counts
  stamped are now per-market truths (fixes the cross-market count lie).

### 3.2 Judgment in the ranker: relative under-representation
- Deficiency score in keyword-slice-selection replaces coverage=count/1: a market is
  deficient in term X when its (size-normalized) representation of X sits well below
  the cross-market norm for X. Exact formula designed with owner (references:
  existing severity/demandScore/recency machinery stays; only the deficiency input
  changes). Graded severity finally becomes meaningful.
- Provisioning law (encode, don't assume): a locality inside a collectable regional
  is never itself collectable (prevents structural demand double-count; today
  accidental).

### 3.3 Reads never mint
- Flip `ensureLocalityMarkets: false` at search's two call sites
  (search.service.ts ~L2968; search-query-interpretation.service.ts ~L661).
  (Leg 5 pre-seeding makes poll-creation minting unnecessary too.)

### 3.4 Adjacent fix
- Extraction-born restaurants in markets without a collection community currently
  enrich WITHOUT geographic bias (resolveMarketKeyForCommunity misses). Derive
  Google-enrichment location bias from the market geometry center instead
  (unified-processing.service.ts ~L2637).

Verification: scenario fixtures — khachapuri over Austin+Houston viewport writes both
markets' true counts; tacos in a one-block viewport writes Austin count >0 (no false
demand); ranker picks the genuinely deficient market first.

---

## Leg 4 — Polls: multi-market "in this area"

- Feed: `market_key IN (viewport market keys)` (polls.service.ts L136–145 Prisma path,
  L222 raw path) — client already receives the full markets[] on every map move
  (services/markets.ts L19–26; controller currently ignores it).
- **Pagination prerequisite**: feed has a hard take:25, no cursor — add cursor
  pagination before widening.
- Header: "Polls in this area" branch in pollsHeaderVisuals (multi_market status
  already flows). Per-poll market labels already exist (attachMarketLabels — already
  multi-market capable).
- Market slicer: fourth SelectorChip ("Market"), same primitive as Type/Sort/Time;
  options = viewport markets grouped by state_code when count > ~20 (states are a
  DISPLAY GROUPING from existing key metadata — NOT core_markets rows; a state
  market row would swallow city resolution via largest-covering-wins and mark whole
  states "covered", killing locality bootstrap). Pinned-market mode already wired
  (marketOverride).

---

## Leg 5 — Market pre-seeding (owner idea, ratified direction)

- Offline batch: seed core_markets with all US municipalities (+ counties where
  needed for regional unions) from TomTom geocode + additionalData, sourced from a
  Census/GNIS gazetteer list (~19.5k incorporated places; TomTom has no
  child-enumeration API — the gazetteer supplies names, TomTom supplies polygons;
  use geometriesZoom to tame payloads). One-time throttled job + idempotent upserts
  into geo_boundary_features/core_markets (933 census stubs pattern already exists).
- Effect: runtime minting deleted EVERYWHERE (search already off per 3.3; poll
  creation's ensure path becomes a plain resolve); header/poll bucket always resolves
  instantly; the only unnamed areas are unincorporated land (header: "this area").
- Open sub-questions: gazetteer source pick; active-vs-dormant seeding policy
  (all active display markets vs activate-on-first-touch); TomTom ToS check for bulk
  polygon storage; rate/cost of ~40k one-time calls.

---

## Leg 6 — Score depth-correction (referenced, NOT designed here)

- Blocker before market #2 is user-visible. Live evidence: Austin avg display 4.07 vs
  NY 7.02 — collection-depth artifact (global percentile of log-mass). Prior art:
  plans/crave-score-cutover-plan.md Step 3/5 (marketReliability z-blend — repudiated
  mechanism, useful fixtures); counter-argument: crave-score-v3 plan L38–42.
  Owner + assistant to design the ideal (likely per-market percentile or
  depth-corrected mass, NOT shrinkage). Placeholder only — expect this section to
  change after that conversation.

---

## Sequencing

1. Leg 1 (cutover + purges) — everything else builds on viewport-only results.
2. Leg 2 (location-centric) — immediately after; 2.3 profile change is REQUIRED
   before cross-market rows are common (stale wrong-market stamp = empty profiles).
   In practice: ship 1 + 2.3 together.
3. Leg 3 (demand) — independent of 2; can parallel.
4. Leg 4 (polls) — after Leg 1; pagination first.
5. Leg 5 (pre-seed) — independent; before launch marketing of zoomed-out browsing.
6. Leg 6 — design session, then its own plan.

## Standing agreements captured (do not lose)

- No caps/ceilings on demand recording; a whole-US search is legitimate demand.
- Suggestion chip label: "See locations" (never a count).
- Addresses in suggestions are EARNED (via recently-viewed) — never cold.
- Notice copy "this area" when multi-market.
- 50k LIMIT deleted; page-size validation at DTO only.
- States = display grouping; no state market rows.
- scoring_market_key = fame source for representative pins.
- Provisioning law: no collectable locality inside a collectable regional.
- Poll-graduation geo-bias fix (3.4).
- Score interleaving accepted UNTIL market #2 (then Leg 6 blocks).
