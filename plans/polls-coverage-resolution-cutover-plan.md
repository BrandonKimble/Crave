# Poll Market Resolution Simplification Plan

Last updated: 2026-04-12
Status: in progress
Scope:

- `/Users/brandonkimble/crave-search/apps/api/src/modules/polls/**`
- `/Users/brandonkimble/crave-search/apps/api/src/modules/search/**`
- `/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/**`

Related plans:

- `/Users/brandonkimble/crave-search/plans/restaurant-identity-domain-rollup-plan.md`
- `/Users/brandonkimble/crave-search/plans/contextual-score-cutover-plan.md`

## Current assumption

This plan now assumes the current database can be reset and rebuilt.

That changes the recommendation:

- prefer the cleaner long-term model now
- do not preserve legacy city-scoped identity rules just to protect old data
- accept some broader same-name collision risk in exchange for a much cleaner market model, then harden matching with place-aware logic
- treat downstream rank/demand/suggestion changes as deliberate rebaselining work, not compatibility regressions to paper over

## Delivered so far

- Local PostGIS-backed Census market source is live:
  - `core_markets`
  - `geo_census_cbsa_boundaries`
  - `geo_census_place_boundaries`
- Local importer script is in place and has been run against the full 2025 US dataset.
- `POST /markets/resolve` is live and uses local geometry, not live Census API calls.
- Poll and search read paths now resolve through the market resolver instead of create-on-read coverage logic.
- Explicit poll creation now ensures `local_fallback` markets from imported Census Places.
- Mobile poll runtime now consumes market-first poll responses, including `no_market` candidate-place CTA states.
- Default search result-row cross-coverage labels have been removed from the live card renderer.
- Search market resolution has been collapsed to one internal market context instead of separate duplicated resolver calls.
- Persisted poll/search/rank/demand columns have been renamed onto market-first names in Prisma and the local Postgres schema:
  - `Poll.marketKey`
  - `PollTopic.marketKey`
  - `DisplayRankScore.marketKey`
  - `SearchLog.marketKey`
  - `SearchLog.collectableMarketKey`
  - `SearchLog.marketStatus`
  - `OnDemandRequest.marketKey`
  - `KeywordAttemptHistory.collectableMarketKey`
- Search-demand, poll scheduler, on-demand request logging, and keyword collection history now read/write through those market-first fields.
- Market index names have been renamed in the live database and verified after migration.
- Main search result queries now use the active market as a real location filter, not just a ranking hint:
  - local search is now `viewport ∩ active market`
  - zooming out no longer causes restaurant locations from adjacent markets to leak into local results
- Search result payloads no longer fall back to stale restaurant entity market keys when no active market is resolved.
- `core_entities.market_key` no longer has a schema-level default, so new entities must choose explicit market/global scope at write time.
- Runtime Reddit ingestion and keyword scheduler mapping now prefer explicit `Market.sourceCommunity` instead of overloaded `CoverageArea.name`.
- Subreddit onboarding now writes the canonical `Market.sourceCommunity` / collectable / scheduler flags alongside the collection-community metrics row.
- The legacy `core_coverage_areas` table has been remodeled into `collection_communities`, and Prisma now treats it as `CollectionCommunity`.
- `CollectionCommunity` has been trimmed back to collection metadata only; onboarding geometry/display hints have been removed from the table shape.
- The old coverage resolver API/module has been deleted entirely.
- Restaurant location enrichment no longer depends on the legacy coverage resolver and now uses market resolution directly for entity re-homing.
- Mobile polls runtime state and bootstrap cache are now internally market-keyed.
- Active API/mobile/runtime surfaces no longer use `coverageKey`, `coverageName`, `coverageStatus`, or `coverage_display`; the steady-state terminology is now `marketKey`, `marketName`, `marketStatus`, and contextual score.
- Poll seed/context helpers and restaurant market re-home helpers have been renamed away from legacy coverage terminology.
- Active scheduler and entity-resolution flows now use market-first naming internally instead of legacy `locationKey` terminology where the concept is actually market-scoped.
- Search low-result/on-demand and demand aggregation flows no longer silently fall back to `'global'` when no local market is resolved; unresolved local requests now stay unresolved instead of being rebucketed into a fake global market.
- `OnDemandRequest.marketKey` no longer has a schema-level default; runtime callers must provide a real market key when creating on-demand requests.
- Reddit ingestion no longer creates restaurant entities in a fake `'global'` market when subreddit-to-market mapping is missing; unresolved restaurant entities are now skipped with a warning instead.

## Remaining cutover work

- The market cutover now hands off to the dedicated restaurant identity follow-on plan:
  - `/Users/brandonkimble/crave-search/plans/restaurant-identity-domain-rollup-plan.md`
- Remaining work in this plan should be treated as compatibility cleanup only, not as the primary place to design cross-market restaurant identity.
- The core remaining architecture problem is no longer market resolution. It is restaurant identity consolidation and market-filtered presentation after identity is shared.
- The highest-risk remaining follow-on assumptions are now narrower:
  - finishing any last restaurant cleanup paths so `core_entity_market_presence` is the only market-membership source of truth
  - broadening market-aware profile hydration/read behavior to any remaining non-search callers
  - the dedicated contextual-scoring cutover that replaces the old explicit score toggle

## Recommendation

Replace the current city/coverage-driven model with a market-driven model for polls.

For the US launch, the canonical poll market resolver should be:

1. `CBSA metro`
2. `CBSA micropolitan`
3. `local fallback`

Google reverse geocoding should stop defining poll markets. It can remain optional metadata for exact-place labeling or other features, but it should not be the source of truth for poll market creation.

With a clean-slate database, the recommended cutover is more aggressive:

- move poll/rank/demand behavior to `marketKey`
- treat `marketKey` as the primary replacement for current `coverageKey/locationKey`
- rebuild restaurant identity and enrichment around stronger place-aware matching rather than preserving old city-key partitions

## Concrete phase-1 decisions

These are the implementation-grade decisions for the clean-slate migration.

### 1. Replace `CoverageArea` with an explicit `Market` registry

Do not preserve the old table shape under the same meaning.

Recommended schema direction:

```prisma
model Market {
  marketId            String      @id @default(dbgenerated("gen_random_uuid()")) @map("market_id") @db.Uuid
  marketKey           String      @unique @map("market_key") @db.VarChar(255)
  marketName          String      @map("market_name") @db.VarChar(255)
  marketType          MarketType  @map("market_type")
  countryCode         String      @default("US") @map("country_code") @db.VarChar(2)
  stateCode           String?     @map("state_code") @db.VarChar(8)
  censusCbsaCode      String?     @map("census_cbsa_code") @db.VarChar(8)
  censusPlaceGeoId    String?     @map("census_place_geoid") @db.VarChar(16)
  sourceCommunity     String?     @map("source_community") @db.VarChar(100)
  isCollectable       Boolean     @default(false) @map("is_collectable")
  schedulerEnabled    Boolean     @default(false) @map("scheduler_enabled")
  isActive            Boolean     @default(true) @map("is_active")
  centerLatitude      Decimal?    @map("center_latitude") @db.Decimal(11, 8)
  centerLongitude     Decimal?    @map("center_longitude") @db.Decimal(11, 8)
  bboxNeLat           Decimal?    @map("bbox_ne_latitude") @db.Decimal(11, 8)
  bboxNeLng           Decimal?    @map("bbox_ne_longitude") @db.Decimal(11, 8)
  bboxSwLat           Decimal?    @map("bbox_sw_latitude") @db.Decimal(11, 8)
  bboxSwLng           Decimal?    @map("bbox_sw_longitude") @db.Decimal(11, 8)
  metadata            Json?       @default("{}")
  createdAt           DateTime    @default(now()) @map("created_at")
  updatedAt           DateTime    @updatedAt @map("updated_at")

  @@index([marketType], map: "idx_markets_type")
  @@index([sourceCommunity], map: "idx_markets_source_community")
  @@index([isCollectable], map: "idx_markets_collectable")
  @@index([schedulerEnabled], map: "idx_markets_scheduler_enabled")
  @@map("markets")
}

enum MarketType {
  cbsa_metro
  cbsa_micro
  local_fallback
  manual
}
```

Notes:

- if reusing `CoverageArea` temporarily makes implementation faster, the migration should still remodel it into the shape above
- the product/system concept should become `Market` immediately, not "coverage but cleaner"

### 2. Rename market-scoped columns in core tables

Recommended first-pass schema changes:

- `Entity.locationKey` -> `Entity.marketKey`
- `DisplayRankScore.locationKey` -> `DisplayRankScore.marketKey`
- `PollTopic.coverageKey` -> `PollTopic.marketKey`
- `Poll.coverageKey` -> `Poll.marketKey`
- `SearchLog.locationKey` -> `SearchLog.marketKey`
- remove `SearchLog.collectionCoverageKey`
- `SearchLog.coverageStatus` -> `SearchLog.marketStatus`
- `OnDemandRequest.locationKey` -> `OnDemandRequest.marketKey`

This is worth doing in the clean-slate migration instead of preserving legacy names everywhere.

### 3. Remove silent `global` defaults from market-scoped tables

Recommended first-pass schema changes:

- remove `@default("global")` from market-scoped columns
- use nullable `marketKey` only where the record can genuinely be non-market-scoped
- do not rely on the string literal `global` to represent missing local scope in normal local flows

Practical interpretation:

- restaurant entities should normally have a real `marketKey`
- globally scoped non-restaurant entities can remain `NULL` market scope or use separate logic as needed

### 4. Concrete decision for replacing `@@unique([name, type, locationKey])`

Decision:

- remove `@@unique([name, type, locationKey])`
- replace it with non-unique performance indexes such as:
  - `@@index([marketKey, type, name])`
  - `@@index([type, name])`
- keep `googlePlaceId` uniqueness for exact place-backed records
- let entity resolution enforce identity heuristics in application logic instead of the database pretending `name + market` is a true identity

Why this is the right decision:

- the old unique constraint encoded a legacy city/coverage model
- with metro-level markets, it becomes too blunt and creates the wrong identity assumptions
- exact store/place evidence is stronger than name+market

Tradeoff accepted:

- duplicates are possible if matching is weak
- that is still preferable to the database hard-coding the wrong identity rule

### 5. Use existing market-scoped tables as the first `RestaurantMarketStats` layer

Do not block the cutover on a brand-new monolithic stats table.

The first cutover can treat these as the initial market-scoped state layer:

- `DisplayRankScore` with `marketKey`
- `SearchLog` with `marketKey`
- `OnDemandRequest` with `marketKey`
- poll aggregates/topics keyed by `marketKey`

That is sufficient to land the `Market + RestaurantEntity + RestaurantLocation + market-scoped state` model without overbuilding phase 1.

### 6. Canonical market resolver API

Replace `/coverage/resolve` with a market-oriented contract.

Recommended read endpoint:

- `POST /markets/resolve`

Recommended request:

```ts
type MarketResolveRequest = {
  bounds?: {
    northEast: { lat: number; lng: number };
    southWest: { lat: number; lng: number };
  } | null;
  userLocation?: { lat: number; lng: number } | null;
  mode?: 'polls' | 'search';
};
```

Recommended response:

```ts
type MarketResolveResponse = {
  status: 'resolved' | 'no_market' | 'error';
  market: {
    marketKey: string;
    marketName: string;
    marketType: 'cbsa_metro' | 'cbsa_micro' | 'local_fallback' | 'manual';
    isCollectable: boolean;
  } | null;
  resolution: {
    anchorType: 'user_location' | 'viewport_center';
    viewportContainsUser: boolean | null;
    candidatePlaceName: string | null;
    candidatePlaceGeoId: string | null;
  };
  cta: {
    kind: 'create_poll' | 'none';
    label: string | null;
    prompt: string | null;
  };
};
```

### 7. Formalized market resolution rules

For search:

1. Determine anchor point:
   - if viewport contains user location, anchor on user location
   - otherwise anchor on viewport center
2. Query Census CBSA metro by anchor point
3. If none, query Census CBSA micro by anchor point
4. If none, query the imported local Census Place table by anchor point
5. If a matching existing `local_fallback` market exists for that place, return it
6. If not, return `status = no_market` with candidate place metadata and CTA info
7. Never create a market on this path

For poll read/header:

1. Resolve using the same anchor rules
2. Return the resolved market if it exists
3. If no market exists but a candidate place exists, return `no_market` plus CTA
4. Never create a market on this path

For explicit poll creation:

1. Resolve using the same anchor rules
2. If metro or micro market exists, use it
3. Else if an imported Census Place exists, create or ensure a `local_fallback` market for that place
4. Else fail with unresolved-market error

### 8. Header and CTA copy rules

Recommended poll header behavior:

- resolving: `Finding market...`
- resolved with polls: `Polls in {marketName}`
- resolved market with zero polls: `No polls in {marketName} yet`
- no market but candidate place: `No polls in {placeName} yet`
- unresolved with no place: `No local polls here yet`

Recommended CTA copy:

- existing market, zero polls: `Create a poll for {marketName}`
- no market but candidate place: `Create the first poll for {placeName}`
- unresolved with no candidate place: no CTA by default

````

## Terminology

Use `market` as the product term going forward.

Current code/database terms that still exist:

- `coverageKey`
- `coverageName`
- `locationKey`

Recommended interpretation during migration:

- `coverageKey` / `locationKey` => legacy storage names for what should become `marketKey`
- `coverageName` => legacy storage name for what should become `marketName`

Recommendation:

- update product and runtime language first
- rename API/contracts next
- rename database fields only when the surrounding slices are stable enough to absorb the migration safely

## Why the plan changed

The earlier plan was still trying to repair a city-box system that is not the best product abstraction.

What this conversation clarified:

- the app does not really want "every reverse-geocoded city" as a poll market
- the app wants a stable market bucket that is healthy for participation and growth
- one user creating a poll should be able to expand the app, but that expansion should create the right market unit
- coverage is currently coupled to ranking, entity scoping, and search demand, so arbitrary coverage creation is risky

## Locked decisions

- Passive browsing must never create a new poll market.
- Explicit poll creation can create growth in a new area.
- The created unit must be the resolved market bucket, not an arbitrary Google locality.
- Poll header should reflect poll market only.
- US-first poll market resolution should prefer `metro -> micro -> local fallback`.
- The app should stop treating reverse-geocoded city names as the default coverage unit.
- Update product/runtime terminology from `coverage` toward `market` wherever that improves clarity.
- The plan stays box-only for now. No polygon ingestion or polygon-based resolution is in scope.
- Remove default coverage labels from the search results list as part of this simplification.
- Longer term, restaurant identity should be less tightly coupled to market.
- With a resettable DB, we can simplify earlier and couple fewer systems to legacy city coverage.
- Search results should stay local to the active viewport/market, not nationwide for broad chains.
- Restaurant profile should default to showing locations in the active market, not every saved location across the US.
- For US market resolution, use Census CBSA geography as the market source of truth.
- For location enrichment, use the resolved market's bounding box for the Google query, then post-filter returned locations against the exact market geography before saving.
- Do not preserve duplicate legacy market resolvers; the cutover should end with one canonical read resolver and one explicit write/ensure path.
- Do not keep nearest-market fallback on passive read paths; if a point is outside a metro/micro market it should resolve to the correct local fallback, not whichever existing row happens to be closest.
- Do not keep overloading `CoverageArea.name` as both subreddit identity and market identity.
- Remove city-specific terminology in scheduler/config/runtime surfaces where the concept is really `market`.
- Collapse search onto one primary `marketKey` concept; do not preserve separate long-lived `uiCoverageKey` and `collectionCoverageKey` semantics if a single market model plus market metadata can answer the same need.
- Make `global` an explicit exception, not the silent default for missing market resolution.
- Keep `global` only for truly cross-market concepts such as global quality and globally scoped non-restaurant entity concepts; local product flows should not silently fall back to `global`.
- Replace registry-name-derived market labels with explicit market fields; do not keep deriving user-facing labels from overloaded `name`.
- Treat coverage-language in poll cache and route params as temporary migration debt with a near-term delete gate after the polls cutover.
- Search defaults to the intersection of viewport and active market.
- If a zoomed-out viewport still contains the user location, search remains scoped to the user's active market.
- If a zoomed-out viewport does not contain the user location, search should use the market closest to the viewport center as the active market.
- Cut over directly toward the final four-part model: `Market`, `RestaurantEntity`, `RestaurantLocation`, and market-scoped stats/state.

## Current product problem

Today one concept, `coverage` / `locationKey`, is doing too many jobs:

- poll feed bucket
- polls header label
- local display-rank partition
- restaurant/entity scope
- search demand scope
- on-demand collection scope

That coupling makes accidental coverage creation dangerous.

Creating a new coverage today can:

- create a new local ranking bucket
- split restaurants into a new entity namespace
- fork search-demand signals
- create confusing result labels

This is the root issue, not just the polls header bug.

During migration, read that list as:

- legacy `coverage/locationKey` fields are currently acting as market fields
- the plan is to make that explicit rather than keep using overloaded location wording

## Immediate cleanup targets

These are not "nice to have" cleanups. They are obvious deletions or simplifications that should ride with the aggressive cutover.

### 1. Collapse duplicate market-resolution logic

Today the repo has multiple overlapping resolver concepts:

- `CoverageRegistryService.resolveCoverage(...)`
- `CoverageRegistryService.resolveOrCreateCoverage(...)`
- `CoverageKeyResolverService.resolve*()`

That is unnecessary.

Target:

- one canonical read-only `MarketResolver`
- one explicit write-time `MarketEnsureService` or equivalent
- no hidden writes inside query/read code

### 2. Delete nearest-existing-market fallback for passive reads

`CoverageKeyResolverService` currently falls back to the nearest saved coverage if no containing viewport exists.

That behavior is not desirable for the new model because it can silently assign the wrong market just because it is the closest saved row.

Target:

- point-in-market first
- CBSA metro or micro if contained
- local fallback if outside those
- never "nearest existing market" for passive read flows

### 3. Stop overloading the coverage registry table

`CoverageArea` currently mixes:

- market-ish viewport data
- display labels
- subreddit identity via `name`
- source semantics via `sourceType`

That is too much in one loosely named shape.

Target:

- either evolve `CoverageArea` into a real market registry immediately, or replace it with a dedicated market table
- add explicit source fields such as `sourceCommunity`
- stop relying on `name` to mean both "market label" and "subreddit key"
- stop storing product-critical identity in ambiguous free-text fields when a typed market record can exist instead

### 4. Remove market creation from browse/query flows completely

`queryPolls(...)` currently has create-on-read behavior.

That should be deleted, not preserved behind flags.

Target:

- browse/query resolves market only
- explicit poll creation is the only user-facing growth lever
- any write path is explicit and observable

### 5. Rename product concepts that still say "coverage" or "city" when they really mean market

Examples that should not survive the cutover as-is:

- `coverage_display` score mode
- scheduler config names like `POLL_MAX_PER_CITY`
- mobile/UI state named around `coverageKey` when it is really market scope

Target:

- `coverage_display` => something like `market_local`
- city-oriented env/config names => market-oriented names
- product/runtime language consistently uses `market`
- `coverageStatus` => market-oriented status naming
- `coverageName` => `marketName` in runtime/API surfaces as early as practical

### 6. Remove results-list market labels by default

The results-list labels currently exist largely to explain the current cross-coverage artifact.

With a cleaner market model, the default list should not need that extra UI noise.

Target:

- no default market badge on result rows
- if market context is needed later, surface it intentionally elsewhere

### 7. Simplify profile location behavior

The profile should not default to showing every known branch across unrelated markets.

Target:

- default profile locations = active-market locations only
- broader chain footprint, if retained at all, should be an explicit secondary affordance

### 8. Rebase poll scheduling terminology and logic

`PollSchedulerService` is already market-like in behavior, but its naming still assumes cities.

Target:

- rename config and comments from city/location wording to market wording
- keep demand/topic seeding scoped to `marketKey`
- avoid preserving a mental model where a market is assumed to be a city

### 9. Collapse dual search scope concepts

Search currently carries both a UI-facing scope and a collection-facing scope.

That is likely unnecessary in the new model.

Target:

- one primary `marketKey` used by search UI, local rank, search logs, on-demand, and demand aggregation
- if collection behavior needs an extra distinction, represent it as explicit market metadata such as `isCollectable`, not a second parallel coverage key flowing through the request/response path

### 10. Remove silent global fallback from local flows

`global` is currently used as a quiet default in too many places.

Target:

- local product flows either resolve to a real market or surface an explicit unresolved/no-market state
- do not silently assign `global` when poll/search market resolution fails
- keep `global` only where the concept is genuinely cross-market

### 11. Replace registry-name-derived labels

Search and polls currently enrich labels from the registry row `name`, which is brittle because `name` also carries subreddit identity in legacy flows.

Target:

- explicit `marketName` on market records
- explicit `sourceCommunity` or equivalent source metadata
- no user-facing label logic that depends on ambiguous registry `name`

### 12. Delete coverage-language from poll cache and route state after polls cutover

The poll bootstrap cache and route params still use `coverageKey` / `coverageName`.

Target:

- allow this only as temporary migration debt
- rename cache and route state to `marketKey` / `marketName` once the polls cutover lands
- do not let coverage-language remain in steady-state mobile runtime

## Target product model

Split the system into clearer layers.

### 1. Market

The market is the poll/rank/demand bucket.

For US launch:

- `marketSource = cbsa_metro | cbsa_micro | local_fallback | manual`
- `marketKey` is the canonical poll market key
- `marketName` is what the polls header shows

This is the replacement for both:

- "whatever city Google returned"
- the overloaded current `coverage/locationKey` mental model

### 2. Origin place

The origin place is where the user actually created the poll or where an item physically is.

Examples:

- poll created in Round Rock, market = Austin
- poll created in The Woodlands, market = Houston
- poll created in Burnet, market = Burnet or Burnet-area fallback

Origin place can be stored as metadata, but it does not have to define the market.

### 3. Entity identity

Restaurant identity should trend toward stable canonical identity, not "same name + different market = different restaurant by default."

Under the aggressive cutover, this should start moving earlier, not be deferred indefinitely behind legacy city coverage.

### 4. Global quality vs local rank

Keep the distinction:

- `global quality`: how good this item is overall
- `local rank`: how it ranks within a market

That is already reflected in the `Local` vs `Global` rank selector and should remain part of the product.

## Data model note

Think about the model in four separate concepts.

### 1. Market

The poll/rank/demand bucket.

Examples:

- `houston_market`
- `austin_market`
- `burnet_local_fallback`

This is what the polls header should show.

Long-term target:

- `Market` is the poll/rank/search-local bucket
- it should have explicit identifiers, labels, source metadata, and lifecycle metadata

### 2. Restaurant entity

The logical restaurant/business record used by search, profiles, and ranking.

Examples:

- `Joe's Pizza` in NYC
- `Joe's Pizza` in Texas
- `Chipotle` in Houston market

This should not change just because the user pans to a different suburb inside the same market.

With the clean-slate assumption, the target direction is:

- one restaurant entity per logical restaurant inside the market model
- many physical `RestaurantLocation` rows under that entity
- stronger place-aware matching and enrichment as the protection against bad merges

More ideal final shape:

- `RestaurantEntity` should represent the business identity
- it should not be forced to fragment just because market bucketing changes

### 3. Restaurant location

The exact physical store/branch.

Examples:

- one Chipotle on Westheimer
- one Chipotle in The Woodlands

This is already modeled by `RestaurantLocation` and `googlePlaceId`.

Long-term target:

- `RestaurantLocation` is the exact branch/store layer
- exact place/store identity should come from location evidence such as `googlePlaceId`

### 4. Origin place

The exact place where a poll was created or where an experience physically happened.

Examples:

- `Round Rock`
- `The Woodlands`
- `Burnet`

This can be stored as metadata without forcing a new market.

### 5. Market-scoped stats/state

The final shape should also support market-scoped state as its own concept.

Examples:

- local rank
- poll effects
- demand
- visibility

This can live in market-scoped tables or records rather than being fused into entity identity.

### Example mapping

`Joe's Pizza NYC` vs `Joe's Pizza Texas`

- two restaurant entities
- separate markets
- separate restaurant locations

`Chipotle with 6 Houston stores`

- one restaurant entity
- one market: Houston
- six restaurant locations

`Chipotle in The Woodlands`

- still Houston market if The Woodlands rolls up to Houston
- one of the restaurant locations can physically be in The Woodlands
- no need for a new poll market just because the store is in a suburb

## Canonical market resolver

### Read path

When the polls sheet or local search context needs a market:

1. Resolve the point to a CBSA metro if one exists.
2. Else resolve it to a CBSA micropolitan area if one exists.
3. Else resolve it to a local fallback market.
4. Never create a new market on this path.

The response should look roughly like:

```ts
type MarketResolution = {
  status: 'resolved' | 'unresolved' | 'error';
  marketKey: string | null;
  marketName: string | null;
  marketSource: 'cbsa_metro' | 'cbsa_micro' | 'local_fallback' | 'manual' | 'none';
  fallbackPlaceName: string | null;
  isCollectable?: boolean;
};
````

### Write path

When a user explicitly creates a poll:

1. Resolve the point to a market using the same logic.
2. If a metro or micro market exists, use that market.
3. If not, create or ensure a `local_fallback` market.
4. Store the poll under that market.

This flips the current bad behavior:

- browsing/query: no market creation
- explicit creation: controlled market creation

## Data source strategy

### US market source of truth

Use US Census CBSA data as the canonical poll-market layer.

Recommended behavior:

- `metro` when inside a metropolitan CBSA
- `micro` when not metro but inside a micropolitan CBSA
- `local_fallback` when outside both

Do not depend on Google reverse geocode to answer the parent-market question.

Implementation direction:

- use exact Census market geography for market resolution
- derive a bounding box from that geography when a rectangular query shape is needed for external APIs
- do not treat the bounding box itself as the authoritative market definition

### Google's role

Google is optional and secondary for polls.

Keep it only if needed for:

- exact-place labels elsewhere in the app
- `placeId` / place metadata
- restaurant validation or other Google-based product features

Do not use Google locality names to create poll markets by default.

For restaurant-location enrichment:

- Google can be used to discover candidate physical locations
- Google should not decide the market boundary
- candidate locations returned from Google should be accepted only if they still fall inside the resolved market geography

## Registry direction

The market registry should become an explicit product primitive, not a loose coverage lookup table.

Target shape:

- one row per market
- typed source metadata
- explicit market identifiers and labels
- explicit optional ingestion metadata such as subreddit linkage or collectability

Recommended direction:

- remodel the current `CoverageArea` concept into a market registry rather than preserving coverage-era semantics
- if the existing table is reused temporarily, its meaning should still become explicitly market-oriented

This means the registry should answer questions like:

- what market is this?
- what is its label?
- what is its source?
- is it collectable / schedulable / ingestible?

It should not require other services to infer those meanings from overloaded fields like `name`.

## Search and ranking implications

### Why market creation is not harmless today

The repo currently ties `locationKey` into:

- local display rank recomputation
- restaurant scoping/identity
- search impression logging
- on-demand request generation

So each new market can create a new "local island."

Under the aggressive cutover, this stops being a reason to preserve the old model and becomes a reason to rebase these systems on one `marketKey` cleanly.

### Recommended short-term approach

Keep the existing `Local` vs `Global` ranking concept, but make `Local` mean `market-local`, not `reverse-geocoded-city-local`.

This reduces fragmentation while preserving the product value of local ranking.

Because the DB can be reset, the app should not try to preserve old local-rank semantics. It should recompute them from the new market model.

Additional tightening:

- do not preserve separate UI-vs-collection scope keys unless proven necessary after the new market model exists
- prefer one primary `marketKey` plus market metadata over two parallel coverage keys
- treat unresolved local search/poll scope as a first-class state instead of defaulting to `global`

## Global vs market policy

Use this policy consistently during the cutover.

### Keep `global` for

- `global quality` ranking mode
- truly global analytics/reporting
- globally scoped non-restaurant entity concepts where market is not part of identity
- optional fallback autocomplete or discovery flows that are intentionally cross-market

### Do not use `global` as fallback for

- polls
- local ranking
- local search intent
- search logging for local intent
- on-demand request bucketing
- demand aggregation used for topic generation
- restaurant enrichment boundaries
- market resolution failures during normal local product flows

### Rule of thumb

- if the feature is answering "what is relevant here?", it should resolve a real `marketKey` or return an explicit unresolved/no-market state
- if the feature is answering "what is broadly true everywhere?", it may use `global`

### Coverage labels in results

Remove default coverage labels from the main search results list.

Reason:

- the market simplification should reduce cross-market noise in normal browsing
- the labels add UI complexity for a concept users do not need to manage directly
- local vs global ranking can still exist without forcing market badges into each result row

If later needed:

- expose market context in drill-down/detail surfaces rather than in every list row

### Search and profile location behavior

Recommended default behavior:

- results list shows restaurants/locations relevant to the active viewport and market
- broad chains should not default to showing locations across the entire US
- restaurant profile should default to active-market locations only

Viewport/market rule:

- effective search scope is the intersection of viewport and active market
- if the viewport is smaller than the market, return viewport-local locations
- if the viewport is larger than the market and still contains the user location, keep the user's active market
- if the viewport is larger than the market and no longer contains the user location, switch to the market closest to the viewport center
- do not spill into adjacent markets by default just because the viewport is zoomed out

Optional later enhancement:

- add a secondary affordance like `Show locations in other markets`
- keep that out of the default profile path

## Aggressive cutover implications

With a resettable database, the following systems should be intentionally rebased onto `marketKey`.

### 1. Display rank

Current issue:

- `DisplayRankScore` is partitioned by `locationKey`

Recommendation:

- treat this as a direct `marketKey` migration
- recompute all local display ranks from the new market model
- do not preserve old city-scoped local-rank buckets

### 2. Search logs and on-demand demand buckets

Current issue:

- search impressions, on-demand requests, and demand aggregation are keyed by `locationKey`

Recommendation:

- rebase these systems to `marketKey`
- accept that queue cardinality and demand aggregation will change
- this is desirable because the old city-coverage buckets are not the right growth units

### 3. Search entity expansion

Current issue:

- entity expansion and matching can be location-scoped today

Recommendation:

- widen/narrow suggestions according to the new market model
- do not try to preserve old city-scoped expansion behavior
- monitor for same-name collisions inside larger metros and improve place-aware matching where needed

### 4. Restaurant-location enrichment

Current issue:

- enrichment uses the current coverage/market rectangle as the Google restriction

Recommendation:

- switch this to the new market geography flow immediately
- exact market geography for resolution
- bounding box only for the Google query
- exact market post-filter before save

### 5. Reddit ingestion mapping

Current issue:

- subreddit ingestion currently maps subreddit -> coverage key

Recommendation:

- introduce a stable subreddit -> market mapping for the rebuilt system
- do not preserve legacy subreddit -> city-coverage assumptions
- ingestion should write into the same market model used by polls/search/rank

## Entity identity direction

### Current issue

Restaurants are often effectively scoped by `locationKey`, which means the same logical restaurant can become multiple local entities if markets proliferate.

That creates:

- duplicate restaurant islands
- split scores
- split mentions and demand
- harder search reconciliation

### Long-term direction

Move toward:

- canonical restaurant identity
- market-local rank as a separate layer
- origin place / market metadata attached to that identity

That means a restaurant should not become "a different restaurant" just because the market bucket changes.

Recommended naming direction:

- `Entity.locationKey` should conceptually become `Entity.marketKey` if it continues to represent the poll/rank bucket
- physical store identity should stay on `RestaurantLocation`
- if a future schema adds explicit origin-place fields, keep those separate from market fields

This is a later cleanup slice, not the first market cutover slice.

Revised recommendation under the clean-slate assumption:

- do this earlier than previously planned
- do not keep city-scoped restaurant identity just to preserve legacy data
- instead, rely on:
  - market-level bucketing
  - `RestaurantLocation.googlePlaceId`
  - place-aware restaurant enrichment/matching

Accepted tradeoff:

- some same-name restaurants inside one metro may need later manual or programmatic disambiguation
- that is still preferable to rebuilding the new system around a legacy city-coverage model you already know you do not want

### Entity matching work required

This is the main non-trivial risk area of the aggressive cutover.

Required direction:

- use exact location evidence first when available:
  - `googlePlaceId`
  - high-confidence address/location match
  - existing `RestaurantLocation` linkage
- use restaurant-name matching only after stronger place evidence is considered
- keep market as a useful narrowing signal, but not the only identity rule
- add explicit disambiguation paths for same-name restaurants inside one market when place evidence is weak
- avoid letting market changes create duplicate entities by default when a stronger location match already exists

In simple terms:

- place/store evidence should outrank market bucketing for identity matching
- market should control local visibility and ranking, not be the sole definition of what the restaurant is

## Ordered execution plan

The aggressive cutover should happen in this order so we delete the wrong abstractions early instead of carrying them forward.

### Phase 1: foundation and delete gates

- introduce the canonical US-first `MarketResolver` with `CBSA metro -> CBSA micro -> local fallback`
- make the read path strictly read-only
- delete nearest-existing-market fallback from passive read flows
- choose the new market registry shape immediately:
  - evolve `CoverageArea` into the initial market registry or replace it
  - stop overloading `CoverageArea.name` as subreddit identity
- define the contract language now:
  - `marketKey`
  - `marketName`
  - `marketSource`
  - explicit market metadata such as `isCollectable` / `sourceCommunity` where needed
- rename obvious product/runtime terms that should not survive:
  - `coverage_display` -> `market_local`
  - city-oriented scheduler/config naming -> market-oriented naming
  - `coverageStatus` / `coverageName` -> market-oriented contract names

Exit gate:

- one canonical read resolver exists
- no passive read path creates data
- no passive read path uses nearest-existing-market fallback
- the registry shape is explicitly market-oriented, not city/subreddit-overloaded
- the new market contract does not rely on dual UI/collection coverage keys by default
- local flows do not silently fall back to `global`
- the market registry direction is explicit enough that old coverage semantics are not being preserved under a new name

### Phase 2: polls cutover

- make polls header derive only from resolved market
- make poll feed query by resolved `marketKey`
- delete browse-time market creation from `queryPolls(...)`
- move explicit creation to the correct behavior:
  - resolve market first
  - create `local_fallback` only when metro/micro does not exist
- rename poll runtime/cache/route coverage-language to market-language as part of finishing this slice

Exit gate:

- Austin no longer sticks after leaving the Austin market
- passive browsing cannot create markets
- explicit poll creation is the only normal user-facing market growth path
- mobile poll cache and route state no longer depend on coverage-language in steady state

### Phase 3: search, ranking, and scheduler rebase

- rebase local rank, display rank, search logs, on-demand requests, and demand aggregation onto one `marketKey`
- keep the existing local/global product concept, but redefine local as market-local
- remove default results-list market badges
- rebase scheduler terminology and behavior from city wording to market wording
- remove dual-key search scope flow unless a concrete requirement remains after the market registry lands

Exit gate:

- local ranking is stable and explainable by market
- scheduler/demand systems operate on market buckets, not legacy city buckets
- default result rows no longer carry market badges
- search no longer needs separate long-lived UI and collection coverage keys in normal operation

### Phase 4: profile and restaurant-location behavior

- default results and profile locations to the active market
- keep the multi-location restaurant system
- switch restaurant-location enrichment to:
  - exact market geography for resolution
  - bbox only for the Google query
  - exact market post-filter before save
- implement the viewport/market rule for zoomed-out search behavior

Exit gate:

- broad chains no longer spill default list/profile locations across unrelated markets
- Austin-market enrichment does not save Burnet locations when Burnet is out of market
- profile defaults to active-market locations only
- zoomed-out search still resolves to one coherent active market instead of mixing adjacent markets

### Phase 5: entity identity and ingestion rebuild

- move restaurant identity toward the new market model instead of legacy city partitions
- reduce dependence on `@@unique([name, type, locationKey])`
- preserve multi-location `RestaurantLocation` behavior
- rebuild subreddit ingestion around explicit subreddit -> market mapping
- make ingestion, enrichment, polls, and search all write into the same market model
- strengthen matching so exact place/location evidence outranks market-only name matching
- define the market-scoped stats layer cleanly instead of fusing market effects into identity

Exit gate:

- markets no longer create unnecessary duplicate restaurant islands
- subreddit ingestion no longer depends on overloaded coverage rows
- entity creation/matching uses market plus stronger place-aware evidence
- the final model is recognizably `Market + RestaurantEntity + RestaurantLocation + market-scoped stats`

## Success criteria

- A user in Round Rock sees Austin market polls.
- A user in The Woodlands sees Houston market polls.
- A user in Burnet does not get shoved into Austin if the resolver says it is outside Austin metro/micro.
- One explicit poll creation can expand the app into a new area.
- Passive browsing cannot spam new markets.
- Local ranking remains meaningful without city-level fragmentation.
- Default chain search results stay local to the active viewport/market.
- Restaurant profile defaults to active-market locations rather than nationwide saved locations.
- Austin-market location enrichment does not save Burnet locations when Burnet is outside the Austin market geography.
- Search, demand, and on-demand flows operate on one primary market scope instead of parallel UI and collection coverage scopes.
- Local flows surface a resolved market or an explicit unresolved/no-market state; they do not silently drop to `global`.
- Poll/search labels come from explicit market fields, not overloaded registry `name`.
- Zoomed-out search uses one coherent active market based on user-location containment or viewport-center proximity, not adjacent-market mixing.
- Identity matching prefers exact place/location evidence over market-only name bucketing.

## Phase-1 implementation checklist

Use this as the immediate execution checklist for the first real cutover slice.

### Schema and Prisma

- `/Users/brandonkimble/crave-search/apps/api/prisma/schema.prisma`
  - add `Market` model and `MarketType` enum
  - rename market-scoped columns from coverage/location language to market language
  - remove `SearchLog.collectionCoverageKey`
  - rename `SearchLog.coverageStatus` -> `marketStatus`
  - remove `@default("global")` from market-scoped columns
  - remove `@@unique([name, type, locationKey])`
  - add replacement indexes for entity lookup by market/name/type

- `/Users/brandonkimble/crave-search/apps/api/prisma/migrations/*`
  - create the reset migration for the market model
  - drop legacy coverage-era constraints/columns that no longer fit the new model

### Market registry and resolver

- `/Users/brandonkimble/crave-search/apps/api/src/modules/coverage-key/**`
  - replace with a market-oriented module path and names
  - implement one canonical read-only resolver
  - remove nearest-existing-market fallback
  - remove create-on-read behavior from read resolver

- new or renamed DTO/controller files
  - add `POST /markets/resolve`
  - implement the new request/response contract

- local Census integration
  - import metro boundaries locally into PostGIS-backed source tables
  - import micro boundaries locally into PostGIS-backed source tables
  - import Census Place fallback boundaries locally into PostGIS-backed source tables
  - store exact geometry plus precomputed bbox/center fields
  - resolve markets with spatial containment queries, not app-level polygon math
  - return candidate local place info without creating data on read

### Polls

- `/Users/brandonkimble/crave-search/apps/api/src/modules/polls/polls.service.ts`
  - stop using `resolveOrCreateCoverage(...)` for `queryPolls(...)`
  - switch reads to the market resolver
  - move explicit market creation to `createPoll(...)`
  - rename DTO/service fields from coverage to market

- `/Users/brandonkimble/crave-search/apps/api/src/modules/polls/dto/*`
  - rename `coverageKey` request/response fields to `marketKey`
  - add response support for no-market CTA state if needed

- `/Users/brandonkimble/crave-search/apps/api/src/modules/polls/poll-scheduler.service.ts`
  - rename city/location terminology to market terminology
  - keep topic generation keyed by `marketKey`

### Search, demand, and on-demand

- `/Users/brandonkimble/crave-search/apps/api/src/modules/search/search.service.ts`
  - replace dual `uiCoverageKey` / `collectionCoverageKey` flow with one `marketKey`
  - remove create-on-read fallback
  - implement viewport/user-location anchor rule
  - rename metadata fields to market language

- `/Users/brandonkimble/crave-search/apps/api/src/modules/search/search-query.executor.ts`
  - rename result metadata fields to market language
  - stop enriching labels from overloaded coverage records

- `/Users/brandonkimble/crave-search/apps/api/src/modules/search/search-entity-expansion.service.ts`
  - switch `locationKey` usage to `marketKey`

- `/Users/brandonkimble/crave-search/apps/api/src/modules/analytics/search-demand.service.ts`
  - rename and rebase aggregation on `marketKey`

- `/Users/brandonkimble/crave-search/apps/api/src/modules/search/on-demand-request.service.ts`
  - rename and rebase request bucketing on `marketKey`

### Entity resolution and ingestion

- `/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/reddit-collector/unified-processing.service.ts`
  - replace subreddit -> coverage lookup with subreddit -> market lookup
  - write restaurant entities with `marketKey`

- `/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/entity-resolver/entity-resolution.service.ts`
  - change grouping/filtering from `locationKey` to `marketKey`
  - preserve place-aware matching priority over market-only name matching

- subreddit onboarding/collection scripts
  - replace coverage-row creation/update with market registry writes
  - store `sourceCommunity` explicitly

### Restaurant enrichment and profile behavior

- `/Users/brandonkimble/crave-search/apps/api/src/modules/restaurant-enrichment/restaurant-location-enrichment.service.ts`
  - resolve exact market geometry first
  - derive bbox only for Google query
  - post-filter returned locations against exact market geography

- `/Users/brandonkimble/crave-search/apps/api/src/modules/search/search.service.ts`
  - make profile default to active-market locations only

### Mobile runtime

- `/Users/brandonkimble/crave-search/apps/mobile/src/services/coverage.ts`
  - replace with market-oriented service/client

- `/Users/brandonkimble/crave-search/apps/mobile/src/services/polls.ts`
  - rename cache shape from coverage to market
  - key poll bootstrap cache by `marketKey`

- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/runtime/polls-runtime-controller.ts`
  - switch reads to the market resolver response
  - support `no_market` state and CTA

- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/runtime/polls-panel-state-runtime.ts`
  - rename local state from coverage to market

- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/panels/pollsHeaderVisuals.tsx`
  - update header/title logic for market copy and CTA states

- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-card-metrics-runtime.ts`
  - remove default result-row market badge logic

- `/Users/brandonkimble/crave-search/apps/mobile/src/overlays/useSearchRouteOverlayRouteState.ts`
  - rename route params from coverage-language to market-language

### Verification

- resolver tests
  - Austin metro resolves correctly
  - Burnet returns no metro/micro and yields place candidate
  - read path does not create local fallback

- poll flow tests
  - browsing does not create market
  - explicit poll creation can create local fallback
  - header reflects market or no-market CTA state correctly

- search tests
  - viewport inside active market returns in-market locations only
  - zoomed-out viewport containing user keeps user market
  - zoomed-out viewport away from user uses center-nearest market

- enrichment tests
  - out-of-market branch returned by Google is filtered out before save

## Non-goals

- global market resolver outside the US in this slice
- polygon ingestion
- removal of local/global rank modes
- full restaurant identity rewrite in the same slice

## Open questions

- Should `local_fallback` markets be created lazily on first poll, or pre-materialized from a place dataset in areas outside CBSA coverage?
- Should the poll model store both `marketKey` and `originPlaceName` / `originPlaceId` immediately, or can `originPlace` wait for a later migration?
- Once market resolution is stable, should search results hide market labels in `Global` mode by default?
