# Restaurant Identity Domain Rollup Plan

Last updated: 2026-04-13
Status: mostly delivered
Scope:

- `/Users/brandonkimble/crave-search/apps/api/src/modules/restaurant-enrichment/**`
- `/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/reddit-collector/**`
- `/Users/brandonkimble/crave-search/apps/api/src/modules/search/**`
- `/Users/brandonkimble/crave-search/apps/api/prisma/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Profile/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/**`

Related plans:

- `/Users/brandonkimble/crave-search/plans/polls-coverage-resolution-cutover-plan.md`
- `/Users/brandonkimble/crave-search/plans/contextual-score-cutover-plan.md`
- `/Users/brandonkimble/crave-search/plans/location-optional-cutover-plan.md`

Scoring handoff note:

- the identity/domain rollup work now assumes one canonical restaurant identity with contextual geographic scoring in search
- active UX no longer exposes the old Local / Global score toggle

## Objective

Finish the post-market-cutover identity model so that:

- restaurant identity is based on business evidence, not market scope
- official website root domain can unify one restaurant across markets
- restaurant stats and votes are shared across markets for domain-backed entities
- profile and search still show only active-market locations by default
- Google location expansion becomes candidate discovery, not identity truth

## Delivered so far

- Added the schema-level domain identity fields:
  - `Entity.canonicalDomain`
  - `RestaurantLocation.websiteDomain`
- Added trusted root-domain parsing using `tldts` in the enrichment layer.
- Primary Google enrichment now persists trusted canonical domain on the restaurant entity when available.
- Location upserts now persist normalized `websiteDomain` on every saved restaurant location.
- Secondary Google Text Search expansion is now gated behind trusted canonical domain and only accepts candidate locations whose returned `websiteUri` matches that canonical domain.
- Same-domain canonical merges are now enabled in the enrichment layer:
  - once a restaurant is enriched with a trusted canonical domain, it can merge into an older canonical restaurant entity with that same domain
  - secondary location expansion now runs against the post-merge canonical entity, but remains scoped to the active market
- Restaurant identity now uses explicit market presence instead of `Entity.marketKey`:
  - restaurants store market membership in `core_entity_market_presence`
  - primary/secondary location enrichment and domain merges keep presence rows up to date
  - legacy restaurant `Entity.marketKey` values have been backfilled into presence and cleared from restaurant rows
- Name-conflict resolution now prefers trusted canonical domain before falling back to `name + seed market`
- Profile hydration on mobile is now market-aware in the touched search/profile/favorites flows:
  - request/cache keys include `marketKey`
  - hydrated profile reads pass the active market when it is already known from the seeded restaurant result
- Remaining non-search profile-open callers that do have market context now pass it too:
  - startup restaurant preload uses startup market context when available
  - active search-screen restaurant launch intents use the current search market when available
- Market-scoped restaurant lookup and ranking groundwork has been moved off `Entity.marketKey` in the key backend paths:
  - `EntityTextSearchService` now treats restaurant market membership as “has a saved location inside this market geometry”
  - restaurant/connection rank refresh now computes affected markets from saved locations inside `core_markets.geometry`
  - poll-triggered rank refresh uses the same location-in-market logic
- Main search result queries now enforce the active market as a real location filter, not just a ranking hint:
  - local search results are now `viewport ∩ active market`
  - wide viewports no longer spill restaurant locations into adjacent markets just because the map is zoomed out
- Search result restaurant aggregates now stay local:
  - result-level `locations` / `locationCount` are built from active-market locations instead of all attached branches on the shared entity
  - result `marketKey` now reflects the active market context or remains `null`; it no longer falls back to stale `Entity.marketKey`
- `core_entities.market_key` no longer has a schema-level default:
  - all entity creation paths now choose market/global scope explicitly at write time instead of silently inheriting `'global'`

These changes make shared-entity rollup safe enough for active enrichment without requiring raw ingestion to solve cross-market identity up front, and they remove the remaining major read-path leak where shared entities could still behave like their old seed market owned them.

## Remaining future work

What remains here is no longer cutover-critical:

- optional analytics/query optimizations on top of the delivered `core_entity_market_presence` model
- any admin/debug tooling that wants to visualize how presence was inferred

Neither is required for the current identity/runtime model to behave correctly.

## Product rules

These are the locked behavior rules for the next slice.

### 1. Restaurant identity is not market identity

`Market` answers:

- which polls apply here
- which local results should be shown here
- which saved locations are relevant here

`RestaurantEntity` answers:

- what business is this

`RestaurantLocation` answers:

- which exact physical store is this

### 2. Trusted official root domain is the strongest business identity signal

For restaurants:

- same trusted official root domain => same restaurant entity
- no trusted official root domain => keep current conservative clustering behavior

Examples:

- `joespizza.com` + `Joe's Pizza` + `Joe's Pizza Broadway` + `Joe's Pizza Downtown` => one entity
- `chipotle.com` across Austin, Houston, Burnet => one entity
- no official domain => do not force cross-market unification

### 3. Shared stats, market-filtered location display

For domain-backed unified entities:

- mentions, votes, connections, boosts, and entity-level quality are shared
- profile location list is filtered to the active market by default
- search results remain market/viewport scoped
- local market controls visibility and relevance, not business identity

### 4. Google Text Search is candidate discovery only

The secondary-location Google call stays, but its job changes.

It should:

- discover candidate additional locations within the active market search box
- only append a location if returned `websiteUri` matches the canonical trusted root domain
- never be used as the proof that two businesses are the same

## Ideal target model

### Core concepts

- `RestaurantEntity`
  - one business identity
  - shared across markets when unified by trusted domain
- `RestaurantLocation`
  - one physical store
  - exact-store identity anchored by `googlePlaceId`
  - carries `websiteUrl` and normalized `websiteDomain`
- `Market`
  - poll/local presentation bucket
- market-scoped presentation/state
  - polls
  - local ranking / visibility
  - local search demand
  - active-market location filtering

### What changes from today

Today the repo still behaves like:

- raw ingestion creates restaurants by `name + market`
- enrichment may merge exact place collisions
- profile returns all attached locations
- location expansion helps shape identity too early

The target behavior is:

- raw ingestion creates tentative restaurant clusters
- enrichment obtains place/domain evidence
- identity consolidation merges by trusted domain
- profile/search filter attached locations by active market
- location expansion fills out nearby branches only after identity is settled

## Ideal end-to-end flow

### 1. Reddit ingestion creates a tentative restaurant entity

Source:

- `/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/reddit-collector/unified-processing.service.ts`

Behavior:

- continue creating restaurant entities conservatively from normalized name + current market
- do not try to infer cross-market business identity here
- this is just the initial cluster

Reason:

- Reddit does not provide official website/domain or exact place identity
- pushing cross-market identity into raw collection would be low-confidence and fragile

### 2. Primary restaurant enrichment resolves one real place

Source:

- `/Users/brandonkimble/crave-search/apps/api/src/modules/restaurant-enrichment/restaurant-location-enrichment.service.ts`

Behavior:

- autocomplete/find-place fallback resolves one primary Google place
- save exact location via `googlePlaceId`
- save `websiteUrl`
- normalize `websiteUrl` to `websiteDomain`

This is the first point where the system has enough evidence to answer:

- same store?
- same business?
- same multi-location group?

### 3. Identity consolidation runs immediately after primary enrichment

Behavior:

- if normalized `websiteDomain` is missing or untrusted:
  - do not attempt cross-market unification
  - keep current entity cluster
- if normalized `websiteDomain` is trusted:
  - look for an existing restaurant entity with the same canonical domain
  - if found, merge the newly enriched entity into that canonical entity
  - if not found, set this entity as the canonical holder of that domain

Important rule:

- same trusted domain => same entity
- this is intentionally stronger than same-name matching

### 4. Optional secondary location discovery runs after identity is settled

Behavior:

- only run secondary location search if the canonical entity has a trusted domain
- query Google Text Search by restaurant name + active market restriction
- keep only returned locations whose `websiteUri` normalizes to the same trusted domain
- save those as additional `RestaurantLocation` rows on the canonical entity

This is now:

- branch discovery

Not:

- identity proof

### 5. Search and profile present one shared entity with market-filtered locations

Behavior:

- entity stats are shared
- when the user is in Austin market, the profile and display location list show only Austin-market locations
- when the user is in Texas market, they see the same entity with Texas-market locations
- if the active market has no saved locations, the UI can fall back to the primary location or show no local locations yet

## Why this is the best fit for the current repo

This is not just conceptually cleaner. It matches the repo’s existing seams.

### Enrichment already owns the right data

The enrichment flow already gets:

- Google place details
- `googlePlaceId`
- address/coords
- `websiteUrl`

Raw ingestion does not.

### Enrichment already owns consolidation

The repo already has:

- exact place collision merge logic in `handleGooglePlaceCollision(...)`
- canonical merge logic in `handleEntityNameConflict(...)`
- merge execution in `RestaurantEntityMergeService`

So the domain-based unification logic belongs in that same layer.

### Read paths already centralize location output

Search/profile read logic already constructs the location list centrally.

That means market-filtered location display can be fixed in one place instead of sprinkled through every screen.

## Required implementation changes

## A. Schema changes

### 1. Add normalized website domain to locations

Add to `RestaurantLocation`:

- `websiteDomain String? @map("website_domain") @db.VarChar(255)`

Indexes:

- `@@index([websiteDomain], map: "idx_restaurant_locations_website_domain")`
- `@@index([restaurantId, websiteDomain], map: "idx_restaurant_locations_restaurant_domain")`

Reason:

- this is the concrete business-identity signal we trust

### 2. Add canonical domain to entity

Add to `Entity`:

- `canonicalDomain String? @map("canonical_domain") @db.VarChar(255)`

Indexes:

- `@@index([canonicalDomain], map: "idx_entities_canonical_domain")`
- `@@index([type, canonicalDomain], map: "idx_entities_type_canonical_domain")`

Do not add a unique constraint yet.

Reason:

- we want a safe migration path while cleanup/merges run
- duplicate same-domain entities can still temporarily exist until merged

### 3. Restaurant market membership is explicit

- restaurant identity does not live on `Entity.marketKey`
- restaurant market membership lives in `core_entity_market_presence`
- restaurant rows can still be created from a market-scoped Reddit mention, but that market context is stored as a presence row, not as entity ownership

## B. Domain normalization and trust rules

Create one shared helper/service responsible for:

- parsing `websiteUrl`
- extracting registrable root domain
- lowercasing and trimming
- stripping `www`
- rejecting generic/shared ordering domains

Initial denylist should include at minimum:

- `doordash.com`
- `ubereats.com`
- `grubhub.com`
- `seamless.com`
- `toasttab.com`
- `toast.site`
- `square.site`
- `menufy.com`
- `opentable.com`

Rule:

- if domain is rejected, treat it as untrusted and unusable for identity

## C. Enrichment flow changes

### 1. Primary enrichment

Update `RestaurantLocationEnrichmentService` so that after saving primary place details it also:

- derives `websiteDomain`
- saves it on the primary location
- computes whether the entity now has a trusted canonical domain

### 2. Domain-based canonical merge

Add a new consolidation step after primary location save:

- find another restaurant entity with the same trusted `canonicalDomain`
- if found and it is not the same entity:
  - merge current entity into canonical entity
- if not found:
  - set current entity `canonicalDomain`

Important rule:

- this step runs before any broad secondary-location expansion

### 3. Secondary location expansion gating

Change the current paginated Google Text Search flow so that:

- it only runs for entities with trusted canonical domains
- it only runs after domain-based canonical merge is complete
- it only appends locations whose returned `websiteUri` normalizes to the same trusted domain
- it stays market-scoped and post-filtered

This is the delete gate for the old behavior:

- remove any logic path where paginated location discovery is used to infer identity before trusted-domain consolidation

## D. Search/profile read-path changes

### 1. Filter returned locations to active market

Current profile/search reads return all `restaurant.locations`.

Change the read path so that:

- given an active market, only locations in that market are returned in the default `locations` list
- `locationCount` should represent either:
  - active-market location count for the primary UI
  - optionally total location count in a separate field if needed later

Recommended output shape:

- `locations`: active-market locations only
- `locationCount`: active-market count
- optional later:
  - `totalLocationCount`

### 2. Select display location from active-market locations first

Display location selection should prefer:

1. active-market primary location
2. active-market nearest location
3. entity primary location fallback

## E. Ranking and scoring behavior

This slice changes the meaning of restaurant scores for domain-backed entities.

### 1. Shared entity score for unified restaurants

For domain-backed unified entities:

- entity-level quality and votes are shared
- do not create separate market-specific entity quality buckets

This is intentional and matches the desired `Chipotle` behavior.

### 2. Market still matters for visibility

Markets still control:

- whether the entity has locations in the active market
- whether the entity should appear in local search
- which locations are shown
- local poll context

### 3. Immediate compatibility approach

Do not block this slice on a perfect new ranking architecture.

Near term:

- keep existing market-local ranking tables
- ensure unified entity can still be ranked in markets where it has presence
- treat shared entity stats as the stronger source of truth, while market determines inclusion/presentation

Follow-up work can further separate:

- shared entity quality
- market-specific visibility/presence

## F. Raw ingestion changes

Keep raw Reddit ingestion conservative for now.

Do:

- continue creating tentative restaurant clusters by name + market

Do not:

- add cross-market website/domain identity logic in raw collection

Reason:

- the needed evidence does not exist there

The only raw-ingestion change needed in this slice is:

- stop treating post-enrichment merged entities as exceptional
- make the downstream merge path a normal and expected part of restaurant lifecycle

## Current implementation assumptions that must change

These are the important current assumptions to delete.

### 1. `Entity.marketKey` defines restaurant identity

Delete this assumption.

It can remain on the row temporarily, but it must stop deciding business identity once trusted domain evidence exists.

### 2. Name conflict handling should only look within one market

Delete this assumption for domain-backed restaurants.

Name remains useful, but trusted domain should outrank same-market naming boundaries.

### 3. Secondary location discovery is identity-critical

Delete this assumption.

Secondary location discovery should become optional completeness work after identity is settled.

### 4. Profile should show all attached locations

Delete this assumption.

Once cross-market unification exists, the default profile must be market-filtered.

## Execution order

### Phase 1. Schema and normalization

- add `RestaurantLocation.websiteDomain`
- add `Entity.canonicalDomain`
- add domain normalization/trust utility
- backfill domains from existing `websiteUrl` rows

Exit gate:

- trusted root domain can be computed deterministically from saved locations

### Phase 2. Domain-first enrichment consolidation

- update primary enrichment to persist normalized domain
- add domain-based canonical lookup and merge
- make same-domain merge run before broad secondary-location expansion

Exit gate:

- newly enriched same-domain restaurants unify into one canonical entity across markets

### Phase 3. Secondary location expansion rewrite

- keep Google Text Search expansion
- gate it behind trusted canonical domain
- only append locations whose returned `websiteUri` matches the canonical domain
- keep market restriction + market post-filter

Exit gate:

- location expansion can no longer attach mismatched-domain branches

### Phase 4. Search/profile market-filtered presentation

- filter profile/search `locations` to active market
- adjust `locationCount` semantics
- ensure display location chooses active-market locations first

Exit gate:

- same unified entity shows different market-specific location lists without changing the underlying entity stats

### Phase 5. Identity cleanup and compatibility tightening

- remove remaining identity decisions that still assume restaurant = name + market
- remove remaining restaurant codepaths that still read `Entity.marketKey` as ownership

Exit gate:

- trusted-domain restaurants are no longer logically market-scoped entities

## Risks and accepted tradeoffs

### Accepted

- same-domain rule may over-group multi-concept restaurant groups on one official domain
- some valid sibling locations will be missed when Google omits `websiteUri`
- restaurants without trusted domains remain conservative and may stay split longer

### Not accepted

- using Google Text Search results alone as identity truth
- showing nationwide location sprawl in the default profile
- keeping market as the long-term answer to business identity

## Recommended next implementation slice

Start with Phase 1 and Phase 2 together:

- schema additions for `websiteDomain` and `canonicalDomain`
- shared domain normalizer/trust service
- domain-based canonical merge inside `RestaurantLocationEnrichmentService`

That is the highest-leverage slice because it changes the actual identity model without yet requiring a full ranking rewrite.
