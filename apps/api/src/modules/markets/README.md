# Boundary Usage Inventory And Future Mapbox Migration Plan

This document tracks every meaningful way the API currently uses downloaded/stored Census-derived market and place boundary data.

Its main purpose is future migration planning. If we replace Census/TIGER-backed market geometry with Mapbox or another provider later, this file should tell us what has to move, what can stay, and what assumptions are baked into the current runtime.

## Why This Exists

Today the repo has two related layers:

- Boundary/source tables populated from Census TIGER data
- A canonical `core_markets` layer that the rest of the app uses for market resolution, filtering, ranking, and collection

If we swap the boundary provider later, we probably do not want to rewrite every `marketKey` consumer. The likely goal is:

- replace how `core_markets` and local fallback markets are built
- keep `core_markets` as the canonical runtime contract where possible

## Canonical Tables And Fields

Defined in `apps/api/prisma/schema.prisma`.

### `core_markets`

Primary runtime market table.

Important fields:

- `market_key`
- `market_name`
- `market_short_name`
- `market_type`
- `country_code`
- `state_code`
- `census_cbsa_code`
- `census_place_geoid`
- `center_latitude`
- `center_longitude`
- `bbox_ne_latitude`
- `bbox_ne_longitude`
- `bbox_sw_latitude`
- `bbox_sw_longitude`
- `geometry`
- `source_community`
- `is_collectable`
- `scheduler_enabled`
- `is_active`

### `geo_census_cbsa_boundaries`

Source CBSA boundary table.

Important fields:

- `cbsa_code`
- `name`
- `short_name`
- `cbsa_type`
- `country_code`
- `state_codes`
- `center_latitude`
- `center_longitude`
- `bbox_*`
- `geometry`
- `metadata`

### `geo_census_place_boundaries`

Source place boundary table.

Important fields:

- `place_geoid`
- `name`
- `short_name`
- `state_code`
- `country_code`
- `center_latitude`
- `center_longitude`
- `bbox_*`
- `geometry`
- `metadata`

### `core_entity_market_presence`

Not a Census table, but it is populated from market geometry and is part of the replacement surface.

Important fields:

- `entity_id`
- `market_key`

## Direct Census / Boundary-Source Runtime Uses

These are the places most likely to require real code changes if we stop using Census-derived boundaries.

### 1. Market Resolution From A Point Or Viewport

Files:

- `apps/api/src/modules/markets/market-resolver.service.ts`
- `apps/api/src/modules/markets/markets.controller.ts`
- `apps/mobile/src/services/markets.ts`

Behavior:

- Resolves a point or viewport center into a CBSA market by checking `ST_Contains(core_markets.geometry, point)`.
- If no CBSA market matches, checks `geo_census_place_boundaries.geometry`.
- If a place matches but no local fallback market exists yet, returns `candidatePlaceName` and `candidatePlaceGeoId` so the caller can create or prompt for a poll.

Depends on:

- `core_markets.geometry`
- `core_markets.bbox_*`
- `core_markets.market_type`
- `core_markets.is_active`
- `geo_census_place_boundaries.geometry`
- `geo_census_place_boundaries.bbox_*`
- `geo_census_place_boundaries.place_geoid`
- `geo_census_place_boundaries.name`
- `geo_census_place_boundaries.short_name`

### 2. Local Fallback Market Creation

Files:

- `apps/api/src/modules/markets/market-registry.service.ts`

Behavior:

- Creates a `local_fallback` row in `core_markets` from a matched Census place.
- Copies the place geometry, center, bbox, country/state, and place geoid into the new market row.

Depends on:

- `geo_census_place_boundaries.place_geoid`
- `geo_census_place_boundaries.name`
- `geo_census_place_boundaries.short_name`
- `geo_census_place_boundaries.state_code`
- `geo_census_place_boundaries.country_code`
- `geo_census_place_boundaries.center_*`
- `geo_census_place_boundaries.bbox_*`
- `geo_census_place_boundaries.geometry`
- `core_markets.census_place_geoid`

### 3. Restaurant Market Resolution From Google Place Geometry

Files:

- `apps/api/src/modules/restaurant-enrichment/restaurant-location-enrichment.service.ts`
- `apps/api/src/modules/markets/market-registry.service.ts`

Behavior:

- Takes Google Place lat/lng for a resolved restaurant.
- Resolves that point into a market through `MarketRegistryService.resolveOrEnsureForLocation(...)`.
- Uses the result to reconcile `core_entity_market_presence` and drive duplicate-merge behavior.

Depends on:

- everything in market resolution above
- `core_entity_market_presence.market_key`

### 4. Geometry-Driven Entity Market Presence Backfill

Files:

- `apps/api/prisma/migrations/20260414123000_add_entity_market_presence/migration.sql`

Behavior:

- Backfilled restaurant market presence by checking whether each restaurant location point is contained inside `core_markets.geometry`.

Depends on:

- `core_markets.geometry`
- `core_markets.is_active`
- `core_restaurant_locations.latitude`
- `core_restaurant_locations.longitude`

## Downstream Runtime Uses Of `core_markets`

These areas do not care that the source was Census specifically. They care that `core_markets` has stable market keys and usable geometry/center/bbox data.

### Search

Files:

- `apps/api/src/modules/search/search.service.ts`
- `apps/api/src/modules/search/search-query.builder.ts`
- `apps/api/src/modules/search/search-coverage.service.ts`
- `apps/api/src/modules/search/search-query-interpretation.service.ts`

Behavior:

- Resolves viewport market coverage from bounds or user location.
- Produces a selected display market plus `collectableMarketKeys` for overlapping markets that actually have linked communities.
- Can ensure local fallback markets for uncovered place-level areas during search flows.
- Filters restaurant locations to the active market using `ST_Contains(core_markets.geometry, restaurant_location_point)`.
- Detects multi-market map viewports using market/viewport intersection rather than a single centerpoint market guess.
- Uses market-scoped restaurant sets for contextual ranking and profile/dish hydration.

Depends on:

- `core_markets.market_key`
- `core_markets.geometry`
- `core_markets.bbox_*`
- `core_markets.market_type`
- `core_markets.is_active`

### Polls

Files:

- `apps/api/src/modules/polls/polls.service.ts`
- `apps/mobile/src/services/polls.ts`
- `apps/mobile/src/services/markets.ts`

Behavior:

- Resolves a poll market from bounds or user location.
- Creates polls against the resolved or ensured market.
- Reads market center and country data for poll context and labels.

Depends on:

- `core_markets.market_key`
- `core_markets.market_name`
- `core_markets.market_short_name`
- `core_markets.center_*`
- `core_markets.country_code`

### Collection / Demand / Ranking

Files:

- `apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts`
- `apps/api/src/modules/content-processing/reddit-collector/keyword-search-scheduler.service.ts`
- `apps/api/src/modules/content-processing/reddit-collector/reddit-batch-processing.service.ts`
- `apps/api/src/modules/content-processing/rank-score/rank-score.service.ts`
- `apps/api/src/modules/polls/poll-score-refresh.service.ts`

Behavior:

- Resolves market keys for communities and collection jobs.
- Builds market-scoped restaurant sets for local demand and keyword slice selection.
- Refreshes market-scoped display ranks from `core_entity_market_presence`.

Depends on:

- `collection_communities.market_key`
- `core_markets.market_key`
- `core_markets.geometry`
- `core_markets.is_active`
- `core_entity_market_presence.market_key`

### Restaurant Enrichment Biasing

Files:

- `apps/api/src/modules/restaurant-enrichment/restaurant-location-enrichment.service.ts`
- `apps/api/src/modules/content-processing/reddit-collector/unified-processing.service.ts`

Behavior:

- Derives bias circles from market center plus bbox span.
- Uses market center/bbox to compute search bias radius for Google calls and collector locality heuristics.

Depends on:

- `core_markets.center_*`
- `core_markets.bbox_*`

## Import / Seed / Onboarding Paths

### Census Import Script

File:

- `apps/api/scripts/import_census_markets.py`

Behavior:

- Downloads TIGER CBSA and PLACE shapefiles.
- Loads `geo_census_cbsa_boundaries`.
- Loads `geo_census_place_boundaries`.
- Seeds or updates CBSA-derived `core_markets` rows from `geo_census_cbsa_boundaries`.

Notes:

- This is the main source-of-truth ingestion path for Census data.
- If Mapbox replaces Census, this is one of the first files that should be replaced or retired.

### Subreddit Onboarding

File:

- `apps/api/scripts/onboard-subreddit.ts`

Behavior:

- Uses Google place lookup for a subreddit’s locality.
- Then tries to match the subreddit center into an existing market using stored `core_markets` bbox and center data.
- Updates `collection_communities.market_key` and `core_markets.source_community`.

Depends on:

- `core_markets.market_key`
- `core_markets.center_*`
- `core_markets.bbox_*`
- `core_markets.source_community`

Important caveat:

- This file currently uses bbox containment only, not polygon `ST_Contains`.
- That means it is not strictly Census-specific, but it does rely on the current market geometry model being precomputed into `core_markets`.

### Base Seeding

Files:

- `apps/api/prisma/seed.ts`
- `apps/api/prisma/seed-polls.ts`

Behavior:

- Assumes known market keys already exist in `core_markets`.
- Example defaults include `us-cbsa-12420` and `us-cbsa-35620`.
- Fails if those market rows are missing.

Implication:

- Any provider swap still needs a compatible seeded `core_markets` layer before these scripts run.

## Migration Guidance: What Likely Changes For Mapbox

### Must Change

- The source import pipeline in `apps/api/scripts/import_census_markets.py`
- Any code that directly reads `geo_census_place_boundaries`
- Any code that depends on `census_place_geoid` being the fallback-locality identifier
- Any migration or backfill that computes market presence from the old geometry tables
- Potentially the unresolved-market CTA flow if Mapbox does not expose an equivalent place identity key

### Can Probably Stay If `core_markets` Remains Canonical

- Search market filtering and ranking
- Poll market scoping
- Rank refreshes keyed by `marketKey`
- Scheduler/community targeting keyed by `marketKey`
- Most mobile/UI code that consumes `marketKey`, `marketName`, `resultCoverageStatus`, `marketResolutionStatus`, and `candidatePlaceName`

The important condition is that `core_markets` still contains:

- stable `market_key`
- usable `geometry`
- usable `center_*`
- usable `bbox_*`
- a local-fallback equivalent for place-level markets

## Practical Replacement Checklist

- Replace Census import with a new boundary/source ingestion path.
- Decide whether `geo_census_cbsa_boundaries` and `geo_census_place_boundaries` are replaced, renamed, or removed.
- Decide what replaces `census_place_geoid` for local fallback markets.
- Keep `core_markets` as the canonical runtime contract if possible.
- Revalidate market resolution from point and viewport.
- Revalidate local fallback market creation.
- Revalidate restaurant market presence backfills and reconciliation.
- Revalidate search viewport multi-market detection.
- Revalidate enrichment bias radius derivation from center/bbox.
- Revalidate seeds and onboarding scripts that expect existing market keys.

## Files Most Worth Revisiting First During A Migration

- `apps/api/scripts/import_census_markets.py`
- `apps/api/src/modules/markets/market-resolver.service.ts`
- `apps/api/src/modules/markets/market-registry.service.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260414123000_add_entity_market_presence/migration.sql`
- `apps/api/src/modules/restaurant-enrichment/restaurant-location-enrichment.service.ts`
- `apps/api/src/modules/search/search.service.ts`
- `apps/api/src/modules/search/search-query.builder.ts`
- `apps/api/src/modules/content-processing/reddit-collector/unified-processing.service.ts`
- `apps/api/scripts/onboard-subreddit.ts`

## Future Mapbox Cutover Plan

This section is the future migration playbook for replacing Census/TIGER-backed market geometry with Mapbox Boundaries.

The intended future state is not "call Mapbox everywhere." The intended future state is:

- use Mapbox Boundaries as the boundary source of truth
- keep `core_markets` as the canonical runtime contract
- use Mapbox Tilequery only for point lookup cases where API-time boundary resolution is useful
- use flat-file GeoJSON ingestion for any backend workflow that needs real polygon geometry

### Why The Migration Must Be All-Or-Nothing

We should not migrate only the point-lookup side or only the polygon side.

Bad partial migration example:

- Tilequery resolves a locality from Mapbox Boundaries
- the backend still stores Census-derived polygons
- a market gets created from a boundary we do not actually have matching geometry for
- viewport overlap, `ST_Contains`, `ST_Intersects`, and ranking/filtering drift from runtime boundary lookup

That would create mismatched market behavior and is not acceptable.

The migration should only happen if both of these are true:

- the runtime point lookup path uses Mapbox Boundaries
- the stored backend polygon source also uses Mapbox Boundaries

### What We Would Buy / License

For the full migration shape, we likely need both:

- Mapbox Boundaries tileset access
- Mapbox Boundaries flat-file GeoJSON access

Why both:

- tilesets + Tilequery support request-time point-in-polygon resolution
- flat-file GeoJSON supports PostGIS ingestion and all backend polygon math

If cost forces a simpler future architecture, a flat-file-only model is technically possible:

- ingest Mapbox Boundaries polygons into PostGIS
- do point-in-polygon locally
- do not depend on Tilequery in production

That would maximize consistency, but it would give up the live API lookup path. If we still want Tilequery in production, license both.

### What Mapbox Products Map To Which Jobs

#### 1. Boundaries Tilesets + Tilequery

Use for:

- coordinate -> boundary lookup
- point-in-polygon resolution for polls, search, or onboarding flows
- request-time "what boundary contains this point?" checks

Do not use as the sole solution for:

- viewport overlap logic
- uncovered-area detection
- `ST_Intersection` workflows
- local fallback polygon storage
- any server-side geometry-heavy ranking or filtering

Reason:

- Tilequery does not return full feature geometry
- Tilequery returns the matched feature and a point result, not the full polygon

#### 2. Boundaries Flat-File GeoJSON

Use for:

- ingesting raw polygon geometry into PostGIS
- building or rebuilding source boundary tables
- creating or updating canonical `core_markets`
- viewport overlap and coverage resolution
- uncovered-area detection
- local fallback market creation
- search and collection polygon filtering
- entity market presence backfills and restaurant market reconciliation

This is the replacement for the current Census/TIGER source geometry layer.

#### 3. Geocoding API

Not required for the core migration.

Geocoding may still be useful for:

- human-friendly place labels
- general reverse-geocode context
- app-facing place search/autocomplete

But it is not the core boundary system and should not be used to create canonical markets in the migration.

### Core Future-State Architecture

The future shape should be:

1. Ingest Mapbox Boundaries flat-file GeoJSON into replacement source boundary tables.
2. Normalize those source boundaries into `core_markets`.
3. Keep `core_markets` as the only runtime market contract used by search, polls, ranking, collection, and enrichment.
4. Optionally use Tilequery for request-time point resolution against the same Mapbox Boundaries product surface.
5. Ensure all local fallback and bootstrap behavior only creates markets that have matching stored polygon geometry in the ingested Mapbox-backed source.

### Recommended Source Table Strategy

Do not overload the current Census table names with mixed semantics.

Preferred future approach:

- add new Mapbox-backed source boundary tables or rename the boundary-source layer to provider-neutral tables
- treat current `geo_census_cbsa_boundaries` and `geo_census_place_boundaries` as legacy/import-specific

Provider-neutral replacement examples:

- `geo_boundary_areas`
- `geo_boundary_localities`
- `geo_boundary_regions`

If we keep the current table names for a transition period, document clearly that they are no longer Census-derived. Long-term, provider-neutral naming is cleaner.

### What Replaces Census-Specific Identifiers

Current local fallback creation depends on:

- `census_place_geoid`

Future Mapbox-backed local fallback creation should instead depend on:

- `mapbox_id`
- `worldview`
- boundary `type`
- boundary `level`

Those should become the durable source-boundary identity fields for local fallback linkage.

The important invariant is:

- every bootstrapped local fallback market must map back to one exact ingested Mapbox boundary feature

### Hard Invariants For A Safe Migration

These rules must hold or the migration should not ship.

#### Same Product Surface

If Tilequery is used in production, it must resolve only against boundary types/levels that also exist in the ingested flat-file geometry set.

No creating markets from:

- Geocoding-only place results
- broader Mapbox place types that are not represented in the ingested boundary geometry

#### Same Version

The ingested flat-file geometry and the tilesets queried by Tilequery must be treated as the same Boundaries release/version family.

No mixing:

- stale ingested polygons
- fresh live Tilequery boundaries

without an explicit refresh plan.

#### Same Worldview

Boundaries supports worldviews. We must choose and enforce one worldview policy, almost certainly:

- `US` + `all`

for the current application context.

If Tilequery and ingested polygons use different worldview assumptions, boundary identity can drift.

#### Same Layer Policy

We must choose one canonical set of Boundary types/levels that are allowed to create markets.

That policy must be identical for:

- Tilequery lookup
- flat-file ingestion
- local fallback creation
- seed/build scripts

### Recommended Initial Market Policy For The Future Migration

This is the recommended starting policy, not a final irrevocable rule.

Use Mapbox Boundaries as follows:

- for metro-like markets:
  - statistical / locality layers that correspond to metro and micro style regions
- for city/place fallback markets:
  - locality level 2 and only additional locality/admin/statistical layers that we also ingest and explicitly bless

Avoid building canonical runtime markets directly from:

- neighborhood-like fuzzy boundaries
- layers with unclear official/admin semantics

unless the product explicitly decides to support that level of granularity.

### Recommended Tilequery Policy

If we use Tilequery in production, it should be tightly constrained:

- query only the specific Boundaries tilesets/layers we also ingest
- filter to the worldview we support
- normalize the returned feature using `mapbox_id` + `worldview`
- reject or ignore boundary types/levels that are outside the allowed market-creation policy

Tilequery should not be a broad exploratory lookup that can return arbitrary locality/postal/admin types and immediately create markets from them.

### Recommended Flat-File Ingestion Policy

The ingestion pipeline should:

1. import the selected Mapbox boundary layers into source tables
2. persist:
   - `mapbox_id`
   - `worldview`
   - `type`
   - `level`
   - `name`
   - `short_name` if available
   - `center_*`
   - `bbox_*`
   - `geometry`
   - original metadata blob
3. build canonical `core_markets` rows from that source layer
4. keep the source boundary identity on `core_markets`

We should preserve the full raw geometry in PostGIS, not simplify away the polygon source of truth prematurely.

### What Stays The Same After Migration

If `core_markets` remains canonical, these runtime areas should stay conceptually the same:

- search viewport coverage and market attribution
- polls market selection and labels
- on-demand fanout to overlapping `collectableMarketKeys`
- collection/community gating
- search/poll-only fallback behavior
- Google enrichment bias derivation from market center/bbox
- market-scoped ranking and filtering

In other words, the future migration should mostly replace:

- source boundary ingestion
- market creation/bootstrap identity

not the entire application market model.

### Expected Code / Schema Changes

At minimum, expect changes in:

- `apps/api/scripts/import_census_markets.py`
- `apps/api/src/modules/markets/market-resolver.service.ts`
- `apps/api/src/modules/markets/market-registry.service.ts`
- `apps/api/prisma/schema.prisma`
- market-related migrations that reference `census_place_geoid` or `census_cbsa_code`
- any backfill using old boundary tables
- `apps/api/scripts/onboard-subreddit.ts`

Expected schema work:

- add provider-neutral source-boundary identity fields to source tables and probably `core_markets`
- phase out `census_place_geoid` / `census_cbsa_code` dependence where they act as durable identifiers
- decide whether source boundary tables become provider-neutral or are replaced entirely

### Future Validation Plan Before Shipping

Before a real cutover, run this validation pass:

1. Choose the exact Boundary types/levels/worldview policy.
2. Ingest a sample of the flat-file GeoJSON into PostGIS.
3. Run Tilequery for a large representative set of points against the same allowed layers.
4. Run local PostGIS point-in-polygon against the ingested polygons for the same points.
5. Compare returned identities using `mapbox_id` + `worldview`.
6. Investigate every mismatch.

Do not ship the migration until:

- the mismatch rate is effectively zero for the allowed market-creation policy
- or every mismatch is understood and intentionally normalized by our selection rules

### Migration Phases

Recommended order:

#### Phase 1. Documented Evaluation

- keep current Census-backed runtime
- obtain Boundaries pricing / license details
- obtain flat-file sample if available
- define the allowed Boundary layer policy

#### Phase 2. Parallel Ingestion Prototype

- ingest selected Boundaries flat-file GeoJSON into temporary provider-specific source tables
- prototype `core_markets` generation from those tables
- validate parity against current Census-backed markets where useful

#### Phase 3. Tilequery Parity Test

- test request-time Tilequery against the same allowed layers
- validate `mapbox_id` / worldview / market selection parity with ingested polygons

#### Phase 4. Core Market Swap

- switch market build/seed path from Census to Mapbox Boundaries
- keep `core_markets` as canonical
- update local fallback creation and source identity fields

#### Phase 5. Runtime Cutover

- switch point-lookup paths to Mapbox-backed resolution
- re-run search/poll/collection validation
- re-run entity market presence reconciliation and backfills if needed

### Recommendation If Budget Is Too High Today

If Boundaries pricing is not viable right now:

- keep the current Census-backed system
- keep this migration plan as the cutover reference
- do not attempt a partial Tilequery-only migration

The acceptable future options are:

- full Mapbox hybrid migration: Tilequery + flat-file GeoJSON
- full Mapbox local-geometry migration: flat-file GeoJSON only, with local point-in-polygon

The unacceptable option is:

- Mapbox API resolution without matching stored polygon geometry

### One-Sentence Future Rule

If we migrate to Mapbox Boundaries, every market that can be resolved or created at runtime must also have matching stored polygon geometry from the same Mapbox boundary product surface.
