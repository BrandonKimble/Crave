# TomTom Market Cutover Plan

## Objective

Replace the current Census-backed market bootstrap and fallback-locality flow with a TomTom-backed flow, while keeping `core_markets` as the canonical runtime contract.

This is a clean cutover plan, not a hybrid plan. The new implementation should:

- stop using Census-backed runtime fallback resolution
- stop depending on `census_place_geoid` for newly created local fallback markets
- stop reading `geo_census_place_boundaries` in runtime market resolution paths
- keep downstream consumers stable by preserving the `core_markets` contract

The only legacy pieces that may remain in the repo are the existing geo tables themselves for reference/regeneration. They should not remain in active runtime use after cutover.

## Current Architecture Summary

Today the market system has two layers:

1. Source boundary layer
- `geo_census_cbsa_boundaries`
- `geo_census_place_boundaries`

2. Canonical runtime layer
- `core_markets`

Most of the app already depends on `core_markets`, not directly on Census.

The main Census-specific runtime seams are:

- [apps/api/src/modules/markets/market-resolver.service.ts](/Users/brandonkimble/Crave/apps/api/src/modules/markets/market-resolver.service.ts)
- [apps/api/src/modules/markets/market-registry.service.ts](/Users/brandonkimble/Crave/apps/api/src/modules/markets/market-registry.service.ts)
- [apps/api/scripts/import_census_markets.py](/Users/brandonkimble/Crave/apps/api/scripts/import_census_markets.py)
- `schema.prisma` fields like `census_place_geoid` / `census_cbsa_code`

Current runtime behavior:

- resolve point into `cbsa_metro`
- else resolve point into `cbsa_micro`
- else resolve point into Census place polygon
- if a place hits but no local fallback market exists:
  - create a `local_fallback` row in `core_markets`
- viewport coverage uses stored `core_markets.geometry`
- uncovered viewport areas are filled by checking `geo_census_place_boundaries`

That means the current runtime already has the right high-level shape:

- point/bootstrap source
- canonical market table
- local PostGIS geometry for filtering/intersection/coverage

## Cutover Philosophy

The cutover should preserve one architectural rule:

- TomTom is the bootstrap source for missing locality markets.
- `core_markets` remains the runtime market system.
- local PostGIS geometry remains the source of truth for search/polls/filtering/coverage after bootstrap.

The cutover should not leave:

- runtime fallback branches that choose between Census and TomTom
- feature flags that permanently keep both systems alive
- duplicate resolution paths in services

The old Census behavior should live only in git history.

## Target Runtime Shape

### Canonical Contract

Keep `core_markets` as canonical.

The rest of the app should continue to consume:

- `market_key`
- `market_name`
- `market_short_name`
- `market_type`
- `country_code`
- `state_code`
- `center_*`
- `bbox_*`
- `geometry`
- `is_collectable`
- `scheduler_enabled`
- `is_active`

Downstream systems that should remain conceptually unchanged:

- search market resolution and attribution
- poll market scoping
- collection / community targeting by `market_key`
- market-scoped ranking
- entity market presence
- restaurant enrichment bias derivation from market center/bbox

### New Source Layer

Add a TomTom-backed source boundary table instead of using Census place boundaries for runtime fallback creation.

Recommended initial table:

- `geo_tomtom_boundaries`

Recommended fields:

- `provider_id`
- `provider_type`
- `provider_level` or `entity_type`
- `name`
- `short_name`
- `country_code`
- `state_code`
- `center_latitude`
- `center_longitude`
- `bbox_ne_latitude`
- `bbox_ne_longitude`
- `bbox_sw_latitude`
- `bbox_sw_longitude`
- `geometry`
- `metadata`
- `fetched_at`

The table is a research/bootstrap cache, not the canonical runtime contract.

### Identity Shape

Stop using `census_place_geoid` as the durable fallback-locality identity.

Replace it with a provider-neutral source identity on `core_markets`, for example:

- `source_boundary_provider`
- `source_boundary_id`
- `source_boundary_type`

For the TomTom prototype:

- `source_boundary_provider = 'tomtom'`
- `source_boundary_id = <TomTom geometry/provider id>`
- `source_boundary_type = 'Municipality'`

The important invariant is:

- every bootstrapped local fallback market must map back to one exact stored TomTom boundary row

## TomTom Policy For The Prototype

### Allowed bootstrap type

Use only:

- `Municipality`

Do not use initially:

- `PostalCodeArea`
- `Neighbourhood`
- `MunicipalitySubdivision`
- `MunicipalitySecondarySubdivision`

Reason:

- `Municipality` is the closest fit to the current locality/fallback-market concept
- `PostalCodeArea` is zip-like and drifts away from place/market semantics
- subdivisions and neighborhoods are too granular and unstable for canonical market creation

### Existing metro markets

Keep existing seeded metro/micro `core_markets` for now.

The TomTom prototype should initially replace only:

- missing local fallback discovery/bootstrap
- uncovered viewport locality resolution

Do not try to replace all existing metro/micro markets in the first cut.

That keeps the prototype scoped to the behavior we actually want to evaluate:

- does TomTom discover locality markets we currently miss?
- do those localities behave correctly once stored in `core_markets`?

## Target User Flows

### Flow 1: Search in an already-known market

Example:
- user opens Austin

Desired behavior:
- no TomTom call
- resolve from existing `core_markets`
- coverage/filtering remains local

Why:
- TomTom should not be in the hot path for already-known markets

### Flow 2: Search in an unknown locality

Example:
- user opens Spicewood

Desired behavior:
1. local `core_markets` resolution misses
2. viewport/user anchor is sent to TomTom with `entityType=Municipality`
3. TomTom returns locality + geometry id
4. fetch geometry from TomTom Additional Data API
5. store the TomTom boundary row in `geo_tomtom_boundaries`
6. create/upsert a `local_fallback` row in `core_markets`
7. retry local resolution using the new `core_markets` row
8. continue search using only local geometry

Important rule:
- once a locality is bootstrapped, future searches should not need TomTom again

### Flow 3: Poll creation in an unknown locality

Example:
- user creates a poll in a locality not already in `core_markets`

Desired behavior:
1. resolve poll market using the same bootstrap flow
2. create the local fallback market
3. attach the poll to the new `market_key`

This should reuse the same bootstrap path as search.

### Flow 4: Restaurant enrichment resolves a place in an unknown locality

Example:
- Google place lat/lng resolves outside known markets

Desired behavior:
1. try local `core_markets`
2. if no market exists, bootstrap from TomTom `Municipality`
3. create local fallback market
4. reconcile `core_entity_market_presence`

This preserves the current enrichment shape but swaps the locality source.

### Flow 5: Mixed viewport with known markets plus unknown uncovered area

Example:
- viewport covers Austin plus adjacent uncovered locality polygons

Desired behavior:
1. compute intersecting stored markets using local PostGIS
2. compute uncovered viewport geometry
3. bootstrap any qualifying uncovered TomTom locality markets into `core_markets`
4. rerun local viewport coverage against `core_markets`
5. select display market and `collectableMarketKeys` from local data only

This is the most important mixed-viewport rule:

- bootstrap first
- then recompute coverage locally

Do not try to combine live TomTom results and stored market geometry in a single final coverage decision.

## Mixed Viewport Design Rules

These are the rules a new implementation must preserve or improve.

### Rule 1: Local geometry decides final coverage

After bootstrap, the final coverage decision must be made entirely from `core_markets.geometry`.

No final UI state should be based on a partially live TomTom response mixed with old local geometry.

### Rule 2: Preserve current overlap semantics

Current coverage logic in [market-registry.service.ts](/Users/brandonkimble/Crave/apps/api/src/modules/markets/market-registry.service.ts) uses:

- `UNDISCOVERED_PLACE_MIN_OVERLAP_SHARE = 0.005`
- `UNDISCOVERED_PLACE_MIN_OVERLAP_AREA_METERS = 250_000`
- `EFFECTIVE_TIE_OVERLAP_SHARE_DELTA = 0.05`

These semantics should be preserved initially, even if implementation details change.

That means:

- only bootstrap uncovered localities when their uncovered overlap is materially meaningful
- preserve current tie/dominance behavior for display-market selection

### Rule 3: Display market selection stays stable

Current selection logic:

- sort by overlap area
- if overlap shares are effectively tied within `0.05`, use market-type priority:
  - `cbsa_metro`
  - `cbsa_micro`
  - `local_fallback`

The TomTom cutover should preserve this UI behavior initially.

Even if bootstrap improves locality discovery, display-market selection should remain stable unless explicitly changed later.

### Rule 4: Collectable market fanout stays keyed by stored markets

`collectableMarketKeys` must continue to come from stored `core_markets` and linked `collection_communities`.

TomTom bootstrap should not directly create collection fanout behavior.

It should only create/store a market first, then existing fanout logic should operate as usual.

### Rule 5: Bootstrap only when needed

Do not call TomTom when:

- an existing market already resolves the point/viewport sufficiently
- the viewport already has adequate coverage from existing `core_markets`

TomTom calls should happen only for uncovered locality bootstrap cases.

## Service-Level Target Shape

### `MarketResolverService`

Current role:
- point -> metro/micro market
- else Census place candidate

Target role:
- point -> metro/micro market from local `core_markets`
- else TomTom locality bootstrap candidate
- else no market

Desired refactor:

- delete direct runtime dependence on `geo_census_place_boundaries`
- replace `candidatePlaceGeoId` with provider-neutral candidate identity, for example:
  - `candidateBoundaryName`
  - `candidateBoundaryId`
  - `candidateBoundaryType`

Do not leave Census/TomTom dual branches in the resolver.

### `MarketRegistryService`

Current role:
- ensure local fallback from Census place
- resolve viewport coverage
- bootstrap uncovered viewport places

Target role:
- ensure local fallback from stored TomTom boundary rows
- trigger TomTom bootstrap when a qualifying locality is missing
- recompute coverage locally after bootstrap

Desired refactor:

- extract TomTom bootstrap into a dedicated internal service:
  - `TomTomBoundaryBootstrapService`

That service should own:

- reverse geocode call
- locality filtering to `Municipality`
- geometry fetch
- source-row upsert into `geo_tomtom_boundaries`
- returning a normalized boundary record

Then `MarketRegistryService` should own:

- when bootstrap is needed
- converting source boundary rows into `core_markets`
- final coverage/result shaping

This keeps the responsibilities clean.

### `SearchService`

Current shape should stay:

- `resolveViewportCoverage(... ensureLocalFallbackMarkets: true)`
- use resolved market info and `collectableMarketKeys`

The implementation should not need search-specific TomTom code.

If search starts knowing about TomTom directly, the architecture is drifting.

### `RestaurantLocationEnrichmentService`

Current shape should stay:

- resolve market for lat/lng via `MarketRegistryService.resolveOrEnsureForLocation(...)`

Same rule:

- no TomTom-specific logic should leak into restaurant enrichment

## Schema Plan

### Add

Add a TomTom source boundary table and provider-neutral source identity to `core_markets`.

Suggested additions to `core_markets`:

- `source_boundary_provider`
- `source_boundary_id`
- `source_boundary_type`

These should become the durable link for newly created fallback markets.

### Keep for now

Keep existing Census columns temporarily if needed for migration safety:

- `census_place_geoid`
- `census_cbsa_code`

But after cutover:

- new runtime paths should not depend on them
- newly created local fallback markets should not write them

### Do not do in this prototype

Do not try to redesign all market types or all market keys in the first pass.

Keep:

- current metro/micro market rows
- current `market_key` conventions

Only change the identity source for new TomTom-backed local fallback markets.

## Proposed New Components

### `TomTomBoundaryBootstrapService`

Responsibilities:

- input: point or viewport anchor
- call TomTom `reverseGeocode` with `entityType=Municipality`
- if no result, return null
- fetch geometry via `additionalData`
- normalize result into:
  - provider id
  - name
  - short name
  - type
  - country/state
  - center
  - bbox
  - geometry
  - raw metadata
- upsert `geo_tomtom_boundaries`

This service should not know about:

- `market_key`
- `core_markets`
- display-market selection
- `collectableMarketKeys`

### `MarketBootstrapNormalizer`

Optional helper if needed.

Purpose:
- build a deterministic `market_key` and labels for TomTom fallback markets

Suggested initial local fallback key shape:

- `us-locality-tomtom-<provider_id>`

If a prettier key shape is later desired, change it explicitly later. Do not block the prototype on naming aesthetics.

## Phase Plan

### Phase 1: Schema + source table

Deliverables:

- add `geo_tomtom_boundaries`
- add provider-neutral source identity fields to `core_markets`
- do not remove legacy columns yet

Exit gate:

- schema compiles
- no runtime behavior changed yet

### Phase 2: TomTom bootstrap service

Deliverables:

- add internal TomTom bootstrap service
- add a script or test harness that proves the Spicewood flow:
  - reverse geocode -> municipality -> geometry -> source row

Exit gate:

- service can bootstrap and upsert `Spicewood`
- geometry persists locally

### Phase 3: Point resolution cutover

Deliverables:

- rewrite `MarketResolverService` to stop reading `geo_census_place_boundaries`
- unresolved local-fallback candidates now come from TomTom bootstrap path
- provider-neutral candidate fields replace `candidatePlaceGeoId`

Delete gate:

- remove active runtime Census place lookup from resolver

Exit gate:

- point resolution still works for known metro/micro markets
- missing locality bootstrap works via TomTom

### Phase 4: Local fallback creation cutover

Deliverables:

- rewrite `ensureLocalFallbackMarket(...)` to build from `geo_tomtom_boundaries`
- stop writing new `census_place_geoid`-based fallback rows

Delete gate:

- remove Census-specific local fallback creation path

Exit gate:

- local fallback markets can be created from TomTom boundary rows only

### Phase 5: Viewport uncovered-area cutover

Deliverables:

- replace `findUncoveredIntersectingPlaces(...)` Census path with TomTom bootstrap-aware uncovered locality flow
- preserve overlap thresholds and tie behavior

Recommended shape:

1. resolve stored intersecting markets
2. compute uncovered geometry
3. derive one or more representative anchor points for uncovered areas
4. bootstrap TomTom municipality markets from those anchors
5. rerun stored coverage

Notes:

- do not call TomTom for every pixel or arbitrary dense sampling
- start with a bounded bootstrap strategy:
  - viewport center if no markets
  - uncovered polygon centroid / point-on-surface
  - possibly a small capped number of uncovered anchors if needed

Delete gate:

- remove active runtime Census uncovered-place path

Exit gate:

- mixed viewport behavior remains stable
- uncovered localities can become local fallback markets

### Phase 6: Cleanup cutover

Deliverables:

- remove runtime references to `geo_census_place_boundaries`
- remove runtime references to `candidatePlaceGeoId`
- rename response fields to provider-neutral names if still needed
- clean comments/docs/service names to reflect the TomTom shape

Delete gate:

- no Census fallback runtime path remains
- no TomTom/Census dual logic remains

## Validation Matrix

### Core validation cases

1. Known market search
- Austin resolves locally
- no TomTom call

2. Unknown locality search
- Spicewood bootstraps
- second request resolves locally

3. Poll creation in unknown locality
- market bootstraps
- poll binds to new `market_key`

4. Restaurant enrichment in unknown locality
- market bootstraps
- entity market presence updates correctly

5. Mixed viewport: dominant known metro + uncovered locality
- coverage stable
- any new locality bootstrap does not break display-market selection

6. Mixed viewport: two known markets with tie behavior
- existing ambiguity/dominance behavior preserved

7. No-market viewport with uncovered locality
- bootstrap occurs
- final result resolves through local geometry

### Specific regression checks

- `collectableMarketKeys` behavior unchanged
- UI `marketResolutionStatus` remains compatible:
  - `resolved`
  - `multi_market`
  - `no_market`
  - `error`
- on-demand collection gating remains keyed by linked communities, not by raw TomTom results
- ranking/search filters still rely only on `core_markets.geometry`

## Implementation Notes For The Next Agent

### Preferred discipline

- Make the cutover by replacement, not by adding provider flags everywhere.
- Keep TomTom-specific code isolated to a bootstrap/source service.
- Keep search/polls/enrichment consuming `MarketRegistryService`.
- Preserve `core_markets` as the contract.

### Avoid

- provider branching throughout downstream services
- live TomTom results leaking directly into final search/poll responses
- hybrid final decisions that combine live TomTom geometry with old stored geometry
- introducing new runtime dependence on `PostalCodeArea`

### Good first files to work in

- [apps/api/src/modules/markets/market-resolver.service.ts](/Users/brandonkimble/Crave/apps/api/src/modules/markets/market-resolver.service.ts)
- [apps/api/src/modules/markets/market-registry.service.ts](/Users/brandonkimble/Crave/apps/api/src/modules/markets/market-registry.service.ts)
- [apps/api/src/modules/markets/README.md](/Users/brandonkimble/Crave/apps/api/src/modules/markets/README.md)
- [apps/api/prisma/schema.prisma](/Users/brandonkimble/Crave/apps/api/prisma/schema.prisma)

### Existing constants and semantics worth preserving initially

From `market-registry.service.ts`:

- `UNDISCOVERED_PLACE_MIN_OVERLAP_SHARE = 0.005`
- `UNDISCOVERED_PLACE_MIN_OVERLAP_AREA_METERS = 250_000`
- `EFFECTIVE_TIE_OVERLAP_SHARE_DELTA = 0.05`

Current market type priority:

1. `cbsa_metro`
2. `cbsa_micro`
3. `local_fallback`

Preserve these in the first cut unless there is a deliberate product decision to change them.

## Definition Of Done

The cutover is done when:

- runtime no longer uses Census place tables for fallback market resolution
- runtime no longer creates local fallback markets from Census place ids
- missing locality markets bootstrap from TomTom `Municipality`
- bootstrapped localities are stored locally and reused without repeated TomTom calls
- final search/poll/coverage behavior still resolves from `core_markets`
- mixed viewport behavior remains stable under existing overlap/tie rules
- downstream services remain provider-agnostic
