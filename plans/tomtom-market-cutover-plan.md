# TomTom Market Cutover Plan

## Status

Implemented in the current workspace. Treat this file as historical design
context plus validation criteria, not as a description of the active runtime.
The active code path now uses provider-neutral `geo_boundary_features`,
`source_boundary_*` market fields, `MarketType.locality`, and
`candidateLocalityName` / `candidateBoundary*` response vocabulary. The
regional market layer is now app-owned (`region-*` keys), not a preserved
provider-boundary wrapper.

## Objective

Replace the old Census-backed market bootstrap and fallback-locality flow with a TomTom-backed flow, while keeping `core_markets` as the canonical runtime contract.

This is a clean cutover plan, not a hybrid plan. The new implementation should:

- stop using Census-backed runtime fallback resolution
- stop depending on `census_place_geoid` for newly created locality markets
- stop reading `geo_census_place_boundaries` in runtime market resolution paths
- keep downstream consumers stable by preserving the `core_markets` contract

The only legacy pieces that may remain in the repo are the existing geo tables themselves for reference/regeneration. They should not remain in active runtime use after cutover.

## Historical Pre-Cutover Architecture Summary

Before this cutover, the market system had two layers:

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

## Vocabulary Reset

The current vocabulary is Census-shaped and US-specific:

- `cbsa_metro`
- `cbsa_micro`
- `local_fallback`

The replacement should keep the underlying product concept, but rename it into provider-neutral runtime language.

### What `local_fallback` actually means today

In the current implementation, `local_fallback` means:

- a smaller locality market we bootstrap when no broader regional market resolves

So the concept is correct. The name is not.

### Recommended runtime taxonomy

Use:

- `regional`
- `locality`
- `manual`

Mapping:

- `cbsa_metro` -> `regional`
- `cbsa_micro` -> `regional`
- `local_fallback` -> `locality`
- `manual` -> `manual`

The app should classify markets by product meaning, not by Census vocabulary.

### Recommended response/API vocabulary

Replace place-specific candidate naming with locality/boundary naming:

- `candidatePlaceName` -> `candidateLocalityName`
- `candidatePlaceGeoId` -> `candidateBoundaryId`

If the implementation wants one more generic pair, use:

- `candidateAreaName`
- `candidateAreaId`

But do not keep `PlaceGeoId` naming once the runtime system is no longer driven by Census place tables.

### Other runtime vocabulary that should change in the same cutover

These names are implementation-shaped around the old model and should be renamed during cutover:

- `ensureLocalFallbackMarket` -> `ensureLocalityMarket`
- `ensureLocalFallbackMarkets` -> `ensureLocalityMarkets`
- `findUncoveredIntersectingPlaces` -> `findUncoveredIntersectingLocalities`
- `findPlace` -> `findLocalityCandidate` or equivalent
- `findLocalFallbackMarket` -> `findLocalityMarket`

These names are still acceptable and can stay:

- `marketKey`
- `marketResolutionStatus`
- `collectableMarketKeys`
- `sourceCommunity`

Reason:

- those are product/runtime concepts, not Census-specific concepts

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

### Aggressive delete-gate rule

Treat this as a replacement, not a compatibility migration.

Delete or fully retire every active Census runtime path during the cutover:

- Census place lookup in market resolution
- Census place lookup in uncovered viewport handling
- Census-based locality creation
- Census-specific response fields such as `candidatePlaceGeoId`
- long-term API compatibility fields for the old response shape
- importer/runtime references that imply Census remains active

The only acceptable exception is temporary DB migration scaffolding needed to move existing rows into the new vocabulary. That scaffolding should not remain in runtime services.

### Legacy source deletion

The clean target deletes the old source tables, importer, schema models, and
runtime vocabulary. There is no active fallback, compatibility mode, or parallel
source path.

If we ever need that historical source data again, recover it from git history
as a new import path with provider-neutral runtime semantics. Do not leave it in
the active repo as a dormant branch.

## Default Long-Term Decisions

These are the defaults the implementation should use unless a concrete code constraint forces a better local adjustment.

### Market keys

Use app-owned, provider-neutral market keys.

Recommended format:

- `<scope>-<country>-<admin1>-<slug>`
- append a short stable hash only when needed for collisions

Examples:

- `region-us-tx-austin`
- `locality-us-tx-spicewood`
- `locality-us-ca-pasadena`

Do not make `market_key` equal to the TomTom id. Provider ids belong in source identity fields, not in the canonical app key. This keeps polls, search logs, ranking rows, collection targets, and entity presence rows stable if the source provider changes later.

### Runtime market taxonomy

Use `market_type` as the provider-neutral runtime scope for this cutover. A
future `market_scope` rename can be done as a vocabulary cleanup, but it is not
part of the TomTom behavior cutover and should not block runtime validation.

Recommended values:

- `regional`
- `locality`
- `manual`

The `market_type` enum is provider-neutral. TomTom provider detail such as
`Municipality` belongs in `source_boundary_*` and source metadata for locality
rows, not in app-facing runtime type values. Regional rows are app-owned and do
not keep old provider source-boundary identity.

### Candidate response shape

Prefer a nested candidate object over more flat place-specific fields:

```ts
candidateMarket: {
  name: string;
  scope: 'regional' | 'locality' | 'manual';
  sourceBoundaryId?: string;
} | null
```

If the implementation needs a flatter transitional API, use:

- `candidateLocalityName`
- `candidateBoundaryId`

Do not keep `candidatePlaceGeoId`.

### Existing regional rows

Regional markets are app-level service regions. They are seeded/configured by
the product, use app-owned `region-*` keys, and do not preserve old
provider-boundary identity as source metadata.

### Source boundary table

Use one provider-neutral source table:

- `geo_boundary_features`

Required identity fields:

- `provider`
- `provider_id`
- `provider_type`

Required uniqueness:

- unique on `provider`, `provider_id`, `provider_type`

If the same provider id can appear for multiple supported provider types, the type must remain part of the unique key. Do not dedupe on `provider_id` alone.

For TomTom Spicewood, the stored identity should look like:

- `provider = 'tomtom'`
- `provider_type = 'Municipality'`
- `provider_id = <TomTom geometry/provider id>`

In the May 2026 preflight, Spicewood returned:

- reverse geocode result id: `F68V_6Na6iH2O2eDFHjKMw`
- Additional Data geometry/provider id: `de51111e-3cfb-4a35-b180-a579ddc0d519`

Use the geometry/provider id as `source_boundary_id` because that is the id used to fetch and identify the stored boundary geometry.

### Bootstrap provider policy

Use TomTom `Municipality` only for the first cut.

Map it into:

- `market_scope = 'locality'`

Do not create canonical markets from `PostalCodeArea`, `Neighbourhood`, or subdivisions in the first cut.

### Geometry precision

For canonical stored polygons, fetch Additional Data without `geometriesZoom` unless a future provider test shows that an explicit zoom is more accurate for the target geography.

Reason:

- TomTom's Additional Data API exposes `geometriesZoom` as a geometry precision/simplification control
- the live Spicewood test returned more detailed geometry when `geometriesZoom` was omitted than when `geometriesZoom=22` was supplied
- canonical stored geometry should prioritize highest available fidelity

Use `geometriesZoom` only for derived/simplified geometry if query performance later requires it. Do not replace the canonical source geometry with a simplified version in the first cut.

Compute canonical `center_*` and `bbox_*` from the stored geometry in PostGIS. Do not trust provider response bbox fields as the canonical geometry bbox.

The bbox columns are derived helper rectangles: use them for cheap SQL
prefilters, viewport coverage math, and external API bias/radius derivation.
They must not replace the authoritative polygon or multipolygon stored in
`geometry`.

Seeded `regional` collection markets should also stay TomTom-backed. They are
app-owned product regions, but their geometry should be a configured union of
TomTom source boundary polygons, not a manual rectangle. Current v1 seeds:

- `region-us-tx-austin`: TomTom `CountrySecondarySubdivision` union for Travis,
  Williamson, Hays, Bastrop, Caldwell, and Burnet.
- `region-us-ny-new-york`: TomTom `CountrySecondarySubdivision` union for New
  York, Kings, Queens, Bronx, and Richmond.

Regional rows keep `source_boundary_*` null because no single provider boundary
is the market identity. The component provider identities live in
`geo_boundary_features` and in the regional row metadata.

Migrate-only environments must not keep old regional geometry active as the
authoritative shape. If a regional row is not backed by
`metadata.source = 'tomtom_boundary_union'`, deactivate it until the TomTom
regional seed rebuilds it.

### Provider response handling

Treat Additional Data responses as per-item success/failure.

Reason:

- the endpoint can return HTTP `200` while an individual requested geometry item contains an `error`
- market creation must require a successful `geometryData` feature with valid Polygon or MultiPolygon geometry

Also pass a request tracking id through TomTom calls where supported so provider support/debugging can be tied back to `market_bootstrap_events.request_id`.

### No-geometry rule

No stored geometry means no market.

Do not create a market from provider labels alone. If a provider returns a name but no valid polygon, return `no_market` or `error` and record the bootstrap event.

## Pre-Implementation TomTom Parameter Preflight

Before writing the runtime cutover, run a small one-off provider probe that confirms the exact TomTom parameters the implementation will use.

This should be a short validation step, not a parallel prototype architecture.

### Required probe cases

Use representative anchors:

- Spicewood, TX: small locality that needs TomTom locality bootstrap
- Austin, TX: already-known regional market where runtime should usually avoid TomTom
- an edge point near a known/unknown market boundary
- a point that should not produce an allowed `Municipality` boundary

For each probe, capture:

- reverse geocode request parameters
- returned `entityType`
- returned geometry/provider id
- returned name/country/admin fields
- Additional Data geometry type
- vertex count
- PostGIS `ST_IsValid` result after import/parsing

### Parameter decisions to validate

Use these defaults unless the probe proves a better choice:

- reverse geocode with `entityType=Municipality`
- set a stable app language, initially `language=en-US`
- send a `Tracking-ID` header derived from the internal request id
- fetch canonical geometry from Additional Data without `geometriesZoom`
- reject any candidate whose Additional Data item has `error`
- reject any candidate whose geometry is not `Polygon` or `MultiPolygon`

### Explicit success criteria

The implementation can start when the probe proves:

- Spicewood resolves to an allowed municipality-like boundary with usable stored geometry
- omitting `geometriesZoom` remains the best canonical geometry choice
- `Tracking-ID` is accepted and echoed or visible in provider response headers
- invalid/missing geometry is observable as a clean failure state
- parsed geometry can be inserted into PostGIS with SRID `4326` and passes validity checks

If the language parameter changes names but not provider ids, keep `language=en-US` for stable app-facing labels and store the raw provider payload in metadata.

### May 2026 preflight result

The planned TomTom parameter shape passed the provider preflight:

- Spicewood reverse geocode with `entityType=Municipality` and `language=en-US` returned `Spicewood, TX`
- Spicewood Additional Data returned a valid `MultiPolygon`
- omitted `geometriesZoom` returned `8911` vertices for Spicewood
- explicit `geometriesZoom=22` returned `5860` vertices for Spicewood
- explicit `geometriesZoom=18` returned `3939` vertices for Spicewood
- PostGIS parsed the omitted-zoom Spicewood geometry as valid `ST_MultiPolygon` with SRID `4326`
- `Tracking-ID` was echoed by both Reverse Geocode and Additional Data
- ocean no-boundary controls returned `numResults = 0`
- bogus Additional Data geometry id returned HTTP `200` with per-item `error = Requested geometry not found`

Decision:

- keep canonical geometry fetches at omitted `geometriesZoom`
- keep `language=en-US`
- handle HTTP `200` Additional Data responses as per-item success/failure
- reject label-only or geometry-error candidates

### Observability

Add structured logs and a persistent event table for market bootstrap attempts.

Minimum event names:

- `bootstrap_attempted`
- `bootstrap_succeeded`
- `invalid_boundary`
- `no_boundary`
- `error`
- `bootstrap_skipped` with `stop_reason`, for example `no_qualifying_uncovered_area`
- `bootstrap_stopped` with `stop_reason`, for example `duplicate_boundary` or
  `attempt_cap_reached`
- `locality_market_ensured`

## Target Runtime Shape

### Canonical Contract

Keep `core_markets` as canonical.

The rest of the app should continue to consume:

- `market_key`
- `market_name`
- `market_short_name`
- `market_scope`
- `country_code`
- `state_code`
- `source_boundary_provider`
- `source_boundary_id`
- `source_boundary_type`
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

Add a provider-neutral source boundary table instead of using Census place boundaries for runtime locality creation.

Recommended initial table:

- `geo_boundary_features`

Recommended fields:

- `provider`
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

Stop using `census_place_geoid` as the durable locality identity.

Replace it with a provider-neutral source identity on `core_markets`, for example:

- `source_boundary_provider`
- `source_boundary_id`
- `source_boundary_type`

For the TomTom prototype:

- `source_boundary_provider = 'tomtom'`
- `source_boundary_id = <TomTom geometry/provider id>`
- `source_boundary_type = 'Municipality'`

The important invariant is:

- every bootstrapped locality market must map back to one exact stored boundary row
- every active `locality` market must have non-null `source_boundary_provider`,
  `source_boundary_id`, and `source_boundary_type`; enforce this with a
  database check constraint, not only cleanup code
- `core_markets(source_boundary_provider, source_boundary_id,
source_boundary_type)` must also reference `geo_boundary_features` so active
  locality identity is not just non-null, but backed by a real stored boundary

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

### Regional markets

Seeded larger regional `core_markets` remain app-owned product regions, but
their geometry must be rebuilt from configured TomTom source-boundary unions.
Do not keep migrated Census/CBSA regional geometry active after this cutover.

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
5. store the boundary row in `geo_boundary_features`
6. create/upsert a `locality` row in `core_markets`
7. retry local resolution using the new `core_markets` row
8. continue search using only local geometry

Important rule:

- once a locality is bootstrapped, future searches should not need TomTom again

### Flow 2b: Search in an area that does not resolve cleanly

Example:

- user searches in an uncovered area
- no existing stored market resolves
- TomTom does not return an allowed locality, or it returns one without usable geometry

Desired behavior:

1. local `core_markets` resolution misses
2. bootstrap attempt runs
3. if no allowed locality result exists, do not create a market
4. if a locality label exists but usable geometry cannot be stored, do not create a market
5. return `no_market` or `error` using the existing runtime contract

Important rule:

- locality naming alone is never enough to create a market
- no market may be created unless it has stored local geometry

### Flow 3: Poll creation in an unknown locality

Example:

- user creates a poll in a locality not already in `core_markets`

Desired behavior:

1. resolve poll market using the same bootstrap flow
2. create the locality market
3. attach the poll to the new `market_key`

This should reuse the same bootstrap path as search.

Active backend search submit is allowed to bootstrap locality markets for the
same reason only when local coverage does not already resolve the request:
otherwise an off-metro search cannot attach durable local demand.
Request-time autocomplete and passive enrichment/read paths are not allowed to
bootstrap markets.
Passive paths also must not create a locality from an already stored TomTom
boundary. Stored-boundary-to-market writes are active-intent only.

### Flow 4: Restaurant enrichment resolves a place in an unknown locality

Example:

- Google place lat/lng resolves outside known markets

Desired behavior:

1. try local `core_markets`
2. if no market exists, do not bootstrap from TomTom
3. leave `core_entity_market_presence` unchanged for that unresolved locality

Restaurant enrichment should be read-only with respect to market bootstrap.
Search and poll creation own missing locality discovery so enrichment does not
create markets as a side effect of provider data cleanup.

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

Corollary:

- if valid geometry is not stored, there is no new market
- runtime must return `no_market` or `error`, not a half-created market

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
  - `regional`
  - `locality`

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

### Rule 6: Anchor selection must be deterministic and interior-safe

For uncovered viewport bootstrap, the anchor point should come from:

- `ST_PointOnSurface(uncovered_component)`

Do not use raw centroid as the default anchor.

Reason:

- `ST_PointOnSurface` guarantees the point lies inside the uncovered polygon
- centroids can land outside irregular or concave polygons
- this makes the bootstrap path deterministic and robust

### Rule 7: Bootstrap the largest uncovered component first

When uncovered geometry has multiple disconnected components:

1. split into components
2. sort by uncovered area descending
3. bootstrap the largest uncovered component first

Reason:

- it prioritizes the part of the viewport that matters most
- it avoids noisy random probing
- it makes behavior reproducible across requests

### Rule 8: Cap bootstrap attempts per request

Recommended initial policy:

- maximum `1` locality bootstrap attempt per viewport request, then recompute
  local coverage

Reason:

- one request should fill the most meaningful missing gap and let the next local
  coverage pass decide if more work is still needed
- the system should not create many markets or make many provider calls during one viewport resolution

Do not use an unbounded bootstrap loop.

### Rule 9: Stop on duplicate or invalid locality results

Stop bootstrap for the current request when:

- the next TomTom result resolves to a boundary already known locally
- the bootstrap result does not produce valid storable geometry
- the remaining uncovered area is below the existing share/area thresholds

Reason:

- prevents repeated calls resolving to the same locality
- prevents creation of label-only or half-created markets
- preserves the existing discipline around meaningful coverage gaps

### Rule 10: Preserve roll-up behavior through local recomputation

Bootstrap should improve coverage, not bypass the existing roll-up model.

That means:

- locality markets reduce uncovered area once stored
- final display market is still chosen by local overlap comparison
- broader `regional` markets should continue to win close ties over smaller `locality` markets

This is the intended roll-up behavior:

- a locality can exist and contribute coverage without necessarily replacing the broader regional display market
- a locality becomes the display market only when local overlap rules make it the correct winner

## Service-Level Target Shape

### `MarketResolverService`

Target role:

- point -> broader regional market from local `core_markets`
- else TomTom locality bootstrap candidate
- else no market

Desired refactor:

- delete direct runtime dependence on old source-boundary tables
- replace `candidatePlace*` naming with provider-neutral candidate identity, for example:
  - `candidateLocalityName`
  - `candidateBoundaryId`
  - `candidateBoundaryType`

Do not leave dual source-provider branches in the resolver.

### `MarketRegistryService`

Target role:

- ensure locality market from stored boundary rows
- trigger TomTom bootstrap when a qualifying locality is missing
- recompute coverage locally after bootstrap

Desired refactor:

- extract TomTom bootstrap into a dedicated internal service:
  - `TomTomBoundaryBootstrapService`

That service should own:

- reverse geocode call
- locality filtering to `Municipality`
- geometry fetch
- geometry validation
- source-row upsert into `geo_boundary_features`
- returning a normalized boundary record

Then `MarketRegistryService` should own:

- when bootstrap is needed
- converting source boundary rows into `core_markets`
- final coverage/result shaping

This keeps the responsibilities clean.

### `SearchService`

Current shape should stay:

- `resolveViewportCoverage(... ensureLocalityMarkets: true)`
- use resolved market info and `collectableMarketKeys`

The implementation should not need search-specific TomTom code.

If search starts knowing about TomTom directly, the architecture is drifting.

### Poll Read Versus Poll Creation

Poll/feed reads and poll creation must use different market-resolution modes:

- `polls_read`: passive header/feed resolution. It may return an existing
  locality market, a broader market, or a candidate locality CTA, but it must
  not bootstrap a new locality market.
- `polls_create`: active user intent to create a poll for a locality. It may
  bootstrap a missing locality market from a stored/provider boundary.
- `search`: active search submit may also bootstrap locality identity when no
  existing market sufficiently covers the request or when a viewport has a
  qualifying uncovered component. If a known regional market already covers the
  request, it resolves locally and should not call TomTom.

This keeps poll browsing from mutating market identity while still allowing an
active user action to create durable locality identity when needed.

For uncovered viewport bootstrap, attempt one locality, recompute local
coverage, and stop the current request. Do not bootstrap a stale batch of
multiple candidates from the original uncovered geometry.

After any bootstrap, final display-market selection must still use the normal
local overlap and tie-priority logic. A newly ensured locality must not bypass
regional tie priority or force itself to become the active display/filter market.

### `RestaurantLocationEnrichmentService`

Current shape should stay:

- resolve market for lat/lng via
  `MarketRegistryService.resolveOrEnsureForLocation(...)` with bootstrap
  disabled
- if no existing market resolves, return no market/candidate context only; do
  not ensure a locality market from stored boundary identity

Same rule:

- no TomTom-specific logic should leak into restaurant enrichment

## Schema Plan

### Add

Add a provider-neutral source boundary table and provider-neutral source identity to `core_markets`.

Suggested additions to `core_markets`:

- `source_boundary_provider`
- `source_boundary_id`
- `source_boundary_type`

These should become the durable link for newly created locality markets.

Recommended enum cutover:

- `cbsa_metro` -> `regional`
- `cbsa_micro` -> `regional`
- `local_fallback` -> `locality`
- `manual` -> `manual`

The implementation now collapses the old regional values into `regional` and
drops old source tables/types. Old provider vocabulary should not remain in
active schema or runtime code.

### Removed from runtime identity

Runtime `core_markets` no longer carries old provider-specific regional
identity columns. Regional market identity is app-owned. Locality market rows
may carry TomTom source-boundary identity because those boundaries can be
refreshed from TomTom.

### Add market bootstrap event table

Add:

- `market_bootstrap_events`

Recommended fields:

- `event_id`
- `event_name`
- `request_id`
- `source`
- `trigger`
- `anchor_latitude`
- `anchor_longitude`
- `viewport_bbox`
- `attempt_index`
- `provider`
- `provider_type`
- `provider_id`
- `candidate_name`
- `market_key`
- `status`
- `failure_reason`
- `uncovered_area_meters`
- `uncovered_share`
- `created_market`
- `metadata`
- `created_at`

Recommended `source` values:

- `search`
- `poll`
- `restaurant_enrichment`
- `script`

Recommended `trigger` values:

- `point_resolution`
- `viewport_uncovered_component`
- `no_known_coverage`

Recommended `status` values:

- `bootstrap_attempted`
- `bootstrap_succeeded`
- `invalid_boundary`
- `no_boundary`
- `bootstrap_skipped`
- `bootstrap_stopped`
- `locality_market_ensured`
- `error`

This table is not the runtime contract. It is for debugging, rollout inspection, and later tuning.

### API and client response migration

The response vocabulary change must be coordinated across API and mobile consumers.

Current consumers still expect:

- `marketType`
- `candidatePlaceName`
- `candidatePlaceGeoId`

Target response shape should expose:

- `marketScope`
- `candidateMarket`

Recommended cutover:

1. update API DTO/types to include the new fields
2. update mobile and shared package consumers to read the new fields
3. remove old `candidatePlace*` fields in the same clean cutover once consumers are updated

Do not leave both shapes as a long-term compatibility layer.

### Keep existing regional rows, but migrate the vocabulary

Keep current larger regional market rows for the first TomTom cutover, but migrate their runtime vocabulary into the long-term shape:

- `market_type = 'regional'`
- app-owned provider-neutral `market_key`
- source identity preserved in `source_boundary_*` fields or metadata

Do not leave newly created locality markets in a different vocabulary than existing regional markets.

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
- upsert `geo_boundary_features`

This service should not know about:

- `market_key`
- `core_markets`
- display-market selection
- `collectableMarketKeys`

Recommended return states:

- `resolved`
  - valid normalized boundary with usable geometry
- `no_boundary`
  - no allowed locality result for the anchor
- `invalid_boundary`
  - a locality label existed but usable geometry could not be stored
- `error`
  - request, parsing, or provider failure

`MarketRegistryService` should create markets only from `resolved`.

Docs-derived implementation notes:

- omit `geometriesZoom` for canonical stored geometry unless provider testing proves an explicit zoom is better
- handle per-item `error` values inside HTTP `200` Additional Data responses
- include a TomTom `Tracking-ID` header using the internal request id when available
- Additional Data supports batch geometry requests up to `20` ids, but the viewport bootstrap path should still respect the smaller per-request attempt cap

### `MarketBootstrapNormalizer`

Optional helper if needed.

Purpose:

- build a deterministic `market_key` and labels for TomTom locality markets

Recommended locality key shape:

- `locality-<country>-<admin1>-<slug>`
- append a short stable hash only for collisions

Provider ids should stay in `source_boundary_id`, not in `market_key`.

## Phase Plan

### Phase 1: Schema + source table

Deliverables:

- add `geo_boundary_features`
- add provider-neutral source identity fields to `core_markets`
- keep `market_type` with provider-neutral enum values; defer any
  `market_scope` rename to a dedicated vocabulary cleanup
- add `market_bootstrap_events`
- do not remove legacy columns yet

Exit gate:

- schema compiles
- no runtime behavior changed yet

Note:

- current raw SQL casts and Prisma enum usage are coupled to `market_type`
- do not remove or rename `market_type` before the read/write paths are updated
- the end state is `market_scope`, but the DB migration should be staged enough to avoid breaking existing SQL during the transition

### Phase 2: TomTom bootstrap service

Deliverables:

- add internal TomTom bootstrap service
- add a script or test harness that proves the Spicewood flow:
- reverse geocode -> municipality -> geometry -> source row
- bootstrap attempts write `market_bootstrap_events`

Exit gate:

- service can bootstrap and upsert `Spicewood`
- geometry persists locally
- bootstrap success/failure is inspectable from the event table

### Phase 3: Point resolution cutover

Deliverables:

- rewrite `MarketResolverService` to stop reading `geo_census_place_boundaries`
- unresolved locality candidates now come from TomTom bootstrap path
- provider-neutral candidate fields replace `candidatePlaceName` / `candidatePlaceGeoId`

Delete gate:

- remove active runtime Census place lookup from resolver

Exit gate:

- point resolution still works for known regional markets
- missing locality bootstrap works via TomTom

### Phase 4: Locality creation cutover

Deliverables:

- rewrite `ensureLocalityMarket(...)` or the equivalent creation path to build from `geo_boundary_features`
- stop writing new `census_place_geoid`-based locality rows

Delete gate:

- remove Census-specific locality creation path

Exit gate:

- locality markets can be created from boundary rows only

### Phase 5: Viewport uncovered-area cutover

Deliverables:

- replace `findUncoveredIntersectingPlaces(...)` Census path with TomTom bootstrap-aware uncovered locality flow
- preserve overlap thresholds and tie behavior

Recommended shape:

1. resolve stored intersecting markets
2. compute uncovered geometry
3. split uncovered geometry into disconnected components
4. choose the largest uncovered component
5. derive the bootstrap anchor with `ST_PointOnSurface(largest_component)`
6. bootstrap one TomTom municipality market from that anchor
7. rerun stored coverage
8. stop the current request; a later request can evaluate any remaining
   uncovered area against freshly stored coverage

Notes:

- do not call TomTom for every pixel or arbitrary dense sampling
- start with a bounded bootstrap strategy:
  - viewport center only when there is no known coverage at all
  - otherwise use `ST_PointOnSurface` of the largest uncovered component
  - cap locality bootstrap attempts per viewport request at `1`
  - stop immediately on duplicate boundary ids or invalid geometry

Delete gate:

- remove active runtime Census uncovered-place path

Exit gate:

- mixed viewport behavior remains stable
- uncovered localities can become locality markets

### Phase 6: Cleanup cutover

Deliverables:

- remove runtime references to `geo_census_place_boundaries`
- remove `geo_census_cbsa_boundaries` from active schema/source ownership
- remove runtime references to `candidatePlaceName` / `candidatePlaceGeoId`
- defer any `marketType` -> `marketScope` API/DB rename until a dedicated
  vocabulary-only cleanup; the enum values are already provider-neutral
- rename response fields to provider-neutral names if still needed
- clean comments/docs/service names to reflect the TomTom shape
- delete the old import script
- delete Prisma models and relations for old source-boundary tables

Delete gate:

- no Census fallback runtime path remains
- no TomTom/Census dual logic remains
- no active source table uses Census vocabulary
- no active runtime service imports Census boundary models

## Validation Matrix

Deploy validation must include:

- run migrations
- run the TomTom regional seed with `TOMTOM_API_KEY`
- run `yarn tomtom-market:health`
- use `yarn tomtom-market:deploy-gate` as the explicit migrate + seed + health
  deployment gate before starting API/worker processes

This prevents a migrate-only environment from silently staying without active
regional collection geometry after stale regional rows are deactivated.

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

- no market bootstrap occurs
- entity market presence remains unchanged until a stored market exists

5. Mixed viewport: dominant known regional market + uncovered locality

- coverage stable
- any new locality bootstrap does not break display-market selection

6. Mixed viewport: two known markets with tie behavior

- existing ambiguity/dominance behavior preserved

7. No-market viewport with uncovered locality

- bootstrap occurs
- final result resolves through local geometry

8. No-market viewport with no valid locality geometry

- bootstrap attempt runs
- no market is created
- final result remains `no_market` or `error`

9. Mixed viewport with one dominant regional market and a newly discovered locality

- locality bootstrap succeeds
- uncovered area shrinks
- final display market can still remain `regional`
- locality contributes coverage without breaking roll-up

10. Mixed viewport with multiple uncovered components

- first bootstrap targets the largest uncovered component
- coverage recomputes locally
- second bootstrap occurs only if remaining uncovered area is still materially significant

### Specific regression checks

- `collectableMarketKeys` behavior unchanged
- UI `marketResolutionStatus` remains compatible:
  - `resolved`
  - `multi_market`
  - `no_market`
  - `error`
- on-demand collection gating remains keyed by linked communities, not by raw TomTom results
- ranking/search filters still rely only on `core_markets.geometry`
- no market is ever created from provider labels alone without stored geometry

## Debugging Examples

The event table should make market behavior explainable without replaying the whole request manually.

### Example 1: Why did Spicewood resolve?

Query:

```sql
SELECT
  created_at,
  event_type,
  source_provider,
  source_boundary_type,
  source_boundary_id,
  candidate_name,
  market_key,
  stop_reason,
  message
FROM market_bootstrap_events
WHERE candidate_name ILIKE '%spicewood%'
ORDER BY created_at DESC
LIMIT 20;
```

Expected read:

- first event shows `bootstrap_attempted`
- success event shows `source_provider = tomtom`,
  `source_boundary_type = Municipality`, and a TomTom geometry/provider id such
  as `de51111e-3cfb-4a35-b180-a579ddc0d519`
- `market_key` points to the created `locality-us-tx-spicewood` market

### Example 2: Why did an area still show `no_market`?

Query:

```sql
SELECT
  created_at,
  event_type,
  stop_reason,
  lookup_latitude,
  lookup_longitude,
  source_boundary_type,
  candidate_name
FROM market_bootstrap_events
WHERE request_id = '<request-id>'
ORDER BY attempt_index ASC, created_at ASC;
```

Expected read:

- `no_boundary` means TomTom did not return an allowed `Municipality`
- `error` with message `tomtom_config_missing` means bootstrap cannot run
  because `TOMTOM_API_KEY` is missing
- `invalid_boundary` means a label existed but no valid polygon was stored
- `bootstrap_skipped` with `stop_reason = no_qualifying_uncovered_area` means
  there was no existing local market but the uncovered area did not produce a
  qualifying bootstrap anchor
- `bootstrap_stopped` with `stop_reason = attempt_cap_reached` means the request
  used its bootstrap budget

Runtime observability:

- `market_bootstrap_events_total` counts durable bootstrap lifecycle event types
  by provider, trigger kind, and stop reason
- `locality_market_ensured` is both persisted and counted in
  `market_bootstrap_events_total`; its `wasCreated` detail remains in event
  metadata
- `market_bootstrap_duration_seconds` tracks attempt latency by outcome

### Example 3: Why did the UI still display the regional market after creating a locality?

Check bootstrap events first:

```sql
SELECT
  event_type,
  candidate_name,
  market_key,
  uncovered_area_meters,
  uncovered_area_share,
  stop_reason
FROM market_bootstrap_events
WHERE request_id = '<request-id>'
ORDER BY attempt_index ASC;
```

Then inspect the final viewport markets from the API response or logs.

Expected read:

- locality was created and reduced uncovered area
- final display still chose `regional` because local overlap comparison and close-tie priority favored the broader market
- this is intended roll-up behavior, not a bootstrap failure

### Example 4: Why did we not create another market in a mixed viewport?

Query:

```sql
SELECT
  attempt_index,
  event_type,
  source_boundary_id,
  candidate_name,
  stop_reason,
  uncovered_area_meters,
  uncovered_area_share
FROM market_bootstrap_events
WHERE request_id = '<request-id>'
ORDER BY attempt_index ASC;
```

Expected read:

- duplicate `source_boundary_id` means the next anchor resolved to a boundary already known locally
- invalid geometry means the provider result was not usable as a market
- attempt cap means the request stopped after the configured maximum of `1` bootstrap attempt

### Structured log fields

Every bootstrap log should include:

- `requestId`
- `source`
- `trigger`
- `attemptIndex`
- `anchor`
- `provider`
- `providerType`
- `providerId`
- `candidateName`
- `marketKey`
- `status`
- `failureReason`
- `uncoveredAreaMeters`
- `uncoveredShare`

The event table is for durable debugging. Logs are for request-time tracing.

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

Current market type priority after vocabulary cutover:

1. `regional`
2. `locality`

Preserve these in the first cut unless there is a deliberate product decision to change them.

## Definition Of Done

The cutover is done when:

- runtime no longer uses Census place tables for fallback market resolution
- runtime no longer creates locality markets from Census place ids
- missing locality markets bootstrap from TomTom `Municipality`
- bootstrapped localities are stored locally and reused without repeated TomTom calls
- final search/poll/coverage behavior still resolves from `core_markets`
- mixed viewport behavior remains stable under existing overlap/tie rules
- downstream services remain provider-agnostic
