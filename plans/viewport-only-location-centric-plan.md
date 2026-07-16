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

### 3.3 Minting: containment-derived, not size-thresholded (owner-revised)
- Minting STAYS (global app; pre-seeding the world is infeasible on the free tier —
  see Leg 5). The defect was the anchor rule, not minting itself. New rule, derived
  not thresholded: reverse-geocode the anchor's municipality, then mint ONLY if that
  municipality's polygon dominantly covers the viewport (viewport ⊆ boundary bbox /
  dominant overlap). A city-scale viewport over Jakarta mints Jakarta; a continental
  viewport is never covered by one municipality → no mint. The boundary itself
  supplies the scale — no mile constants. Applies at all read sites; poll creation
  keeps unconditional resolve-or-mint (explicit local intent). Dedupe the two
  per-search call sites into one resolution.

### 3.5 Demand → polls cold-start (new, owner idea — design item)
- Searches in non-collectable markets currently write null-lane ask events every
  ranker ignores. Instead: record demand against the (possibly just-minted) market
  so accumulating demand in an uncovered city can seed/prompt polls there — polls
  being the proven data inlet for uncovered areas (poll-entity-seed + graduation).
  Shape TBD with owner (auto-generated poll prompts? creator-ladder tie-in?).
- **Scope rule (ratified): two demand kinds, two bounds.** Collection demand =
  every COLLECTABLE market in view (bounded by capability, ~dozens at scale;
  scheduler judges deficiency relatively). Poll-seeding demand for display-only
  markets = only markets that are SUBJECTS of the viewport (attention-bounded,
  ≤~3) — a US-wide search writes zero display-only demand (no subjects), the
  two-town search feeds both towns. Prevents nationwide searches sprinkling false
  demand across thousands of municipalities.
- **Nothing-is-lost guarantee (owner concern, resolved):** every search persists to
  search_events (query, bounds, attributions) — lanes are eager views over a
  complete ledger. Town-specific demand structurally cannot be missed: the first
  subject-scale search over an unnamed town IS the event that mints it and records
  its demand (same condition). Pre-mint searches touching a town are broad-scale
  by definition — not town evidence.
- **Broad demand consumed at its own scale:** state/US-wide search activity feeds
  an EXPANSION ANALYTICS view over the existing ledger (which foods, which
  geographies, which metro to onboard next) — a read view, not a new write path.
  Never pushed down to towns (1/1200th of a bit each = manufactured noise).
- **No optimistic polls in un-attended places:** polls are questions to a
  community; seeding them off diffuse broad demand creates unanswered dead content
  exactly where first visitors judge the app. Subject-scale demand seeds polls;
  broad demand steers expansion.
- Rate-limit posture: demand machinery is inherently self-limiting (≤5 terms ×
  bounded markets per search, identity-key dedupe, 5-min cooldown, distinct-user
  log-damped ranking weights → single-user spam ≈ one ask). No bespoke limits;
  a standard per-user gateway rate limit is generic infra, tracked separately.

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
- Market slicer: fourth SelectorChip ("Market"), same primitive as Type/Sort/Time.
  Grouping level is DERIVED FROM GEOGRAPHY, not a count threshold: viewport markets
  span one state → list cities; span multiple states → list states, tap a state to
  drill into its cities (state_code / country-subdivision metadata already on every
  market key — states are a DISPLAY GROUPING, never core_markets rows; a state
  market row would swallow city resolution via largest-covering-wins and mark whole
  states "covered", killing locality bootstrap). Pinned-market mode already wired
  (marketOverride).

---

## Leg 5 — Market seeding strategy (DEMOTED: lazy minting is THE mechanism)

- TomTom free tier (CONFIRMED from account dashboard 2026-07-14, per-API MONTHLY):
  Search API — which includes /search/2/additionalData (our polygon fetch) —
  **2,500/month** (current usage 126); Geocoding + Reverse Geocoding 20,000/month
  each (usage 46 / 409). The polygon endpoint is the binding constraint.
- Math: free-tier-only US pre-seed ≈ 8 months (infeasible). PAID: overage ≈
  $0.75/1k geocoding (19.5k fits the free 20k/mo anyway) + ~$2.50/1k Search/
  additionalData → ~17k paid polygon calls ≈ **$40–60 one-time for the whole US**
  (third-party rates, verify ±2× in console before running). RECOMMENDED (owner
  confirmation pending): HYBRID — pay to pre-seed the US once; containment-gated
  lazy minting
  (3.3) remains the universal mechanism (international + gazetteer gaps). Organic
  minting (~1-2 Search calls per new city touched) is self-throttling; if a viral
  month exhausts the quota, degrade gracefully (header "this area", retry next
  month).
- Optional accelerant only: warm-seed launch geographies (e.g. Texas metros) as an
  operator batch inside the daily budget. Gazetteer (Census/GNIS) supplies names
  (TomTom has no child-enumeration API); geometriesZoom tames payloads; idempotent
  upserts into geo_boundary_features/core_markets.
- ToS: owner reviewed — storage is fine; no further check needed.
- Runtime quota note: each mint costs ~2 non-tile calls; organic minting is
  self-throttling (only city-scale viewports over uncovered ground).

### Market resolution — two primitives + reconciler (DESIGN OF RECORD, supersedes
### the single-display-market resolver shape)

The from-scratch abstraction (ratified after first-principles audit):

- **placeAt(point) → market** — outermost-covering point query (exists, correct,
  untouched). Consumers: restaurant stamping, poll creation at user location,
  fame-pin.
- **marketsInView(viewport) → { markets: [(market, share)], place }** — pure DB
  read, the SET is the first-class answer; `place` is DERIVED, not elected: the one
  market that dominantly covers the viewport, else null ("this area"). DELETES:
  selectViewportDisplayMarket election, the 5% tie band, regional-priority
  tiebreak, per-caller mode flags, mint-side-effects-in-read-path, anchor metadata
  leakage. Header = place ?? "this area"; polls feed = the set; demand = collectable
  subset; slicer = the set grouped by state.
- **Minting reconciler** — the ONLY writer; consumes "subjectless-but-attended"
  probes off the read path (background; poll creation is the sole awaiting caller).

**The subjects rule (Option B, owner-ratified):** subjects(region):
  1. Probe region's anchor (reverse geocode, cheap pool) → municipality m + bbox.
  2. m covers ≥ ATTENTION_FRACTION of the region → accept m; recurse on region − m.
  3. Else → stop (∅ for this branch).
  Accepted set = the viewport's subjects (structurally ≤ ~3-4 — each must be a real
  bite of what remains). Mint every unnamed subject. Multi-subject viewports keep
  header "this area" while all subjects get names/poll buckets/demand lanes.

**ATTENTION_FRACTION = 1/3 — derived, not tuned**: locked to the product sentence
"a viewport attends to at most ~3 places" (fraction f ⇔ max ⌊1/f⌋ subjects) — a
meaning-constant like the 365d half-life. Empirical backstop (metric that can show
RED): post-launch, track immediate zoom-into-one-place right after a subjectless
"this area" view — frequent occurrences = fraction too strict. It is the design's
ONE named scale constant — it *defines* "attending to a place" (a meaning-constant like the 365d
half-life, not a mechanism patch). It is load-bearing: below it the reconciler
would degenerate into sliver enumeration; without multi-subject acceptance it
would drop real two-town demand. It REPLACES the 5% tie band + dominance election
(net constants decrease). Same constant serves the `place` dominance derivation.

#### Mechanics (retained from prior draft, now organized under the reconciler)

Kept as-is (already-correct primitives, verified in code): negative cache
(market_bootstrap_events no_boundary, 30-day TTL, ~1km radius) and single-flight
dedupe (inFlightBootstraps keyed by ~100m cell). geo_boundary_features unique
triple = idempotency.

**M1 — Reconciler ladder, ordered by cost (one resolution per request — collapse
the two call sites; reads never enter this ladder, they only enqueue):**
  1. Stored polygons already answered the read (DB, free; GiST index on
     core_markets.geometry — build check at ~20k rows post-seed).
  2. Skip probe when the unnamed remainder of the viewport is below
     ATTENTION_FRACTION (nothing attendable is unnamed).
  3. Negative cache hit near the anchor → stop.
  4. Run subjects() — reverse geocode probes (cheap pool, 20K/mo), bbox-vs-region
     commensurability tests are free, recursion carves and repeats.
  5. Per accepted unnamed subject, spend the scarce call: additionalData polygon
     (2.5K/mo pool) → upsert boundary + locality market (is_collectable=false).

**M2 — Caller-declared blocking (the snappiness fix):** minting is currently
awaited inside the search request (two TomTom round trips in-path —
market-registry.service.ts:344). New contract: resolveViewportCoverage takes
mode-appropriate minting =
  - 'await' — poll creation only (user explicitly needs the market; spinner OK);
  - 'enqueue' — search + polls_read: fire-and-forget background mint; respond NOW
    with status 'unresolved' ("this area" header); the market exists by the next
    interaction. Reads never wait on TomTom.

**M3 — International:** delete the US-only country gate
(tomtom-boundary-bootstrap normalizeCountryCode). Key shape:
locality-<countryCode>[-<subdivisionCode>]-<slug> — subdivision optional (not all
countries have one; take TomTom's countrySubdivision when present). No regional
markets abroad at mint time: ROLL-UP IS A COLLECTION-ONBOARDING ACT, not a minting
act — when a metro is onboarded (operator), its regional polygon lands and the
outermost-covering resolver nests existing localities automatically (that query is
already type-agnostic and anticipates this).

**M4 — US-seed gaps (unincorporated/CDP land the gazetteer misses):** lazy mint
covers them — reverse geocode either returns a municipality anyway (mint) or
nothing (negative-cache; header "this area"). No special path.

**M5 — Seeding activation policy (RESOLVED):** pre-seeded municipalities are
active display markets from day one — instant header/poll-bucket resolution with
zero API calls is the point of the seed.

**M6 — Quota degradation:** mint queue checks the monthly Search-API ledger; on
exhaustion, mints defer (queue drains next month); reads are unaffected by
construction (they never wait). Poll creation on an exhausted month: create against
the reverse-geocoded name with polygon backfilled by the queue (boundary-pending
market) — never block a user's poll on quota.

---

## Leg 6 — Score calibration: measured audience gain (DESIGN OF RECORD, ratified 2026-07-14)

**Principle** (owner-ratified): effort is equalized physically (collect every market
with the same effort — never over-collect one city to flatter it); audience size is
equalized mathematically; passion-per-audience is the signal and is never touched.
The score's user sentence: "an 8 means the people of this city, unprompted, can't
stop bringing this place up" — true at every audience size. v3 philosophy fully
retained: count IS the signal, no entity shrinkage, no rescaling, no fitted curves,
uncertainty = absence.

### The equation

For each decay lane τ ∈ {365d stable, 21d fast} (lanes calibrated independently,
matched clocks):

- Room size:  A_M(τ) = Σ over gate-passing documents d from market M's sources:
  0.5^(age_d/τ)
- Gain:       g_M(τ) = max(A_M(τ), A_floor) / A_ref
  (A_ref = pinned constant — Austin stable-lane A at calibration launch — so score
  meaning never drifts as markets onboard; A_floor = measurement floor, capacity-
  class constant; the clamp smoothly bounds amplification at A_ref/A_floor — no
  activation branch, no blend curve)
- Calibrated counts, PER MENTION, normalized by the mention's OWN source market:
  m̃ = Σᵢ 0.5^(ageᵢ/τ)/g_{M(i)}(τ);  ũ = Σᵢ uᵢ·0.5^(ageᵢ/τ)/g_{M(i)}(τ)
- Everything downstream is v3 UNCHANGED: e = log1p(m̃ + 0.7ũ); dishes atomic;
  restaurant = Σ 0.5^i·dish_i + 2×praise; global percentile per subject type;
  truncated-normal display; rising = fast − stable.

### Design facts (why this exact shape)

- Calibration is INSIDE log1p (count preprocessing), never post-log subtraction:
  log1p(x/g) ≠ log1p(x) − log(g) at small x — post-log overcorrects sparse markets.
- Per-mention normalization: chains praised in two rooms get each mention weighed by
  its own room; scoring_market_key exits the math (stays provenance + fame-pin);
  dish-vs-restaurant offsets dissolve (calibration precedes the subject split).
- Source-complete rule (the multi-source answer): every mention-producing source
  contributes its documents to A_M and its mentions to mass under the same decay.
  Poll threads already conform (documents with community=marketKey); future sources
  (more subreddits, FB groups) calibrate on arrival — zero per-source config.
- Recency self-healing: archive backfill arrives pre-decayed in BOTH numerator and
  denominator → collection-timing distortion cancels in the ratio. (Dev-DB
  Austin-vs-NY gap is partly this artifact — archive vs fresh chronological slice.
  Owner: at launch both cities get archive + ongoing chronological, same effort.)
- Gain is measured, not inferred: A comes from document volume, never from
  restaurant scores → no endogeneity, no trust curve. The only-game-in-town case
  that survives (small-but-real audience adores a mediocre place) is the score's
  sentence being true, not a lie — fixtures still gate it.

### Build items

1. **g_M(τ) primitive** at the aggregation layer — consumers: score calibration,
   demand deficiency (Leg 3.2: a term's calibrated mass per market vs cross-market
   norm becomes a one-liner), later popularity/trending normalization.
2. **Mention provenance unification**: add source_document_id to
   core_restaurant_item_mentions (events already carry it); extraction writes it;
   retention invariant: every mention's source document persists forever.
   Eliminates the "can't attribute this mention" class.

### Fixture-gated decisions (empirical, not debate)

- A-metric: gate-passing doc count vs distinct-author count vs upvote-volume —
  compute all for the Austin/NY corpora, pick what makes cross-market anchors sane.
- A_floor + A_ref values; upvote linearity check (bigger rooms may upvote more per
  mention — start linear, revisit only with evidence).
- Resurrect the old suite as acceptance tests: sparse_market_winner_not_fake_elite,
  sparse_market_real_strength_can_escape_baseline, market_maturity_curve,
  market_rollup_round_rock_austin.
- KILL CONDITION: calibrated must beat raw v3 on the named scenarios or the
  calibration is deleted and v3 stands.

### Operational notes

- Relevance-gate changes are corpus-affecting events (prompt_hash persisted —
  detectable); re-gate or accept drift knowingly.
- Timing: build with this wave (the distortion is already user-visible in the launch
  city: dev DB Austin avg display 4.07 vs NY 7.02 with NY corpus in the pool);
  hard-gate before market #2 regardless.
- vs the deleted v1/v2: we keep centering-by-measured-gain only; rescaling (MAD/IQR
  reshaping) and entity confidence shrinkage stay dead. Market-level trust curve
  replaced by the measured clamp.

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
- Minting stays, reconciler-owned with the subjects rule (see Leg 5 resolution
  section); demand→polls cold-start pipeline (3.5).
- Resolution = two pure primitives (placeAt, marketsInView) + background reconciler;
  ATTENTION_FRACTION is the one named scale constant (replaces 5% tie band +
  display-market election).
- Slicer grouping derived from states-in-view, never a count constant.

## Small residuals (fold in opportunistically, don't lose)

- search_events totalResults/totalRestaurantResults change meaning post-Leg-1
  (viewport-wide, not market-filtered) — note for any analytics reading them.
- search-mounted-results-data-store identity key's `market:` segment becomes
  vestigial (harmless) — drop during Leg 2 touch.
- Threshold taxonomy sweep (owner ask): judgment-thresholds should be derived or
  relative (per-market demand target — deleted in 3.1; state grouping — derived in
  Leg 4; minting scale — derived in 3.3; polls take:25 — replaced by pagination in
  Leg 4). Capacity constants are legit and stay (pin budget 30 = screen real estate,
  page size 20/25 = payload, scheduler per-cycle budgets, cooldowns, half-lives,
  5% market tie band).
