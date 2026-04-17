# Restaurant Tag Signals + Search Plan

Last updated: 2026-04-15
Status: implemented
Scope:

- `/Users/brandonkimble/crave-search/apps/api/prisma/**`
- `/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/reddit-collector/**`
- `/Users/brandonkimble/crave-search/apps/api/src/modules/search/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/**`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Profile/**`

Related docs:

- `/Users/brandonkimble/crave-search/apps/api/src/modules/search/README.md`
- `/Users/brandonkimble/crave-search/plans/restaurant-identity-domain-rollup-plan.md`
- `/Users/brandonkimble/crave-search/plans/search-performance-plan.md`

## Objective

Add a first-class restaurant tag system that:

- captures restaurant-level evidence for menu items, non-menu-item foods/categories, food attributes, and restaurant attributes
- makes that evidence searchable without fabricating dish/menu-item rows
- broadens restaurant matching without requiring fake dish/menu-item rows
- powers profile/result tag pills with mention counts
- keeps the current dish/menu-item graph clean

## Current behavior

Today the model is intentionally split:

- `core_restaurant_items` represents presentable restaurant-food rows
- non-menu-item food/category mentions persist as `core_restaurant_entity_events` / `core_restaurant_entity_signals`
- item rows keep direct menu-item metrics and separate derived support metrics

That split is useful because it prevents the profile and result UI from filling up with fake dishes like:

- `Mattie's -> brunch`
- `Desnudo -> coffee`
- `El Perrito -> taco`

But the tradeoff is real:

- those mentions do not fabricate fake dish rows, but they do produce searchable restaurant evidence immediately through tag signals
- search historically required item evidence to return a restaurant for food-driven queries

## Product decision

We should preserve the current distinction:

- menu-item graph remains structured and presentation-safe
- tag evidence becomes a separate, broad restaurant-level discovery surface

We should not solve this by stuffing all weak evidence into `core_restaurant_items`.

## Recommendation

### 1. Keep restaurant items, but narrow their meaning

Treat `core_restaurant_items` as:

- restaurant -> presentable food/item rows
- the thing dish lists, top dishes, and food result cards are built from

Implemented shape:

- Prisma model remains `Connection` for code stability
- DB table is now `core_restaurant_items`

### 2. Add restaurant entity event + aggregate tables

Recommended tables:

- `core_restaurant_entity_events`
- `core_restaurant_entity_signals`

Implemented companion services:

- `ProjectionRebuildService`
- `ReplayService`

Recommended event columns:

- `restaurant_id`
- `entity_id`
- `entity_type`
- `evidence_type`
- `source_id`
- `mentioned_at`

Recommended event uniqueness:

- `(source_id, restaurant_id, entity_id, evidence_type)`

Recommended aggregate columns:

- `restaurant_id`
- `entity_id`
- `entity_type`
- `mention_count`

Recommended indexes:

- unique `(restaurant_id, entity_id)`
- `(entity_id, mention_count desc)`
- `(restaurant_id, mention_count desc)`
- `(restaurant_id, entity_type, mention_count desc)`

V1 recommendation:

- do not add raw upvote fields
- do not add decayed scores yet
- do not add source-breakdown counters to the aggregate table

Reason:

- one restaurant/entity pair should produce one combined tag count
- the tag use case is discovery + UI chips, not full vote-sensitive dish scoring
- counts are easier to reason about and cheaper to maintain
- the aggregate keeps search fast
- the event table preserves history and gives us rebuild/future derivation flexibility

Important semantic rule:

- `entity_type` describes the canonical entity only
- it does not distinguish menu-item-backed vs non-menu-item-backed evidence
- those distinctions live only in `core_restaurant_entity_events.evidence_type`
- example: all `taco` evidence for a restaurant rolls into one `food` tag row

Naming recommendation:

- use `entity` in database table names because these rows are canonical restaurant-to-entity evidence
- keep `tag` as the product/API term for pills and search explanations
- this keeps the schema precise while still letting the UI talk about tags

## Time-derived metrics

We do not need `recent_mention_count`, `first_mentioned_at`, or `last_mentioned_at` on the aggregate table in v1.

If we want those later:

- derive them from `core_restaurant_entity_events`
- add them to the aggregate only when a real product need appears

Recommendation:

- keep the aggregate count-focused
- use the event table as the historical source of truth
- preserve menu-item vs non-menu-item vs category vs attribute distinctions in `evidence_type` on the event table only

## Tag population rules

### Menu-item mentions

When `restaurant + food + is_menu_item = true`:

- update/create the `core_restaurant_items` row as today
- also increment `core_restaurant_entity_signals` for:
  - exact food entity
  - emitted food categories
  - emitted food attributes
  - emitted restaurant attributes

### Non-menu-item food mentions

When `restaurant + food + is_menu_item = false`:

- do not create a `core_restaurant_items` row
- increment `core_restaurant_entity_signals` for:
  - exact food entity
  - emitted food categories
  - emitted food attributes
  - emitted restaurant attributes

This is the key change that makes:

- `El Perrito -> taco`
- `Gelato Paradiso -> gelato`
- `Mattie's -> brunch`

searchable as restaurant tags without turning them into fake dishes.

Important product rule:

- a restaurant/entity tag is unified regardless of whether the underlying mentions were menu-item-backed or non-menu-item-backed
- example: menu-item-backed `taco` mentions and non-menu-item `taco` mentions should roll into one `taco` tag count for that restaurant
- if we need source-aware behavior later, derive it from `core_restaurant_entity_events`

### Attribute-only mentions

When the mention has no specific food but has attributes:

- increment `core_restaurant_entity_signals` for food attributes
- increment `core_restaurant_entity_signals` for restaurant attributes

### Derived item support

Non-menu-item food/category/food-attribute evidence no longer mutates direct item counts.

Instead:

- direct menu-item evidence stays in the base `core_restaurant_items` metrics
- overlapping support evidence is derived from active events into separate support fields
- tag signals still make broad restaurant evidence usable immediately

## Search behavior

### Core change

Restaurant search should no longer require a matching item row for the searched entity in order to return a restaurant.

Instead, restaurant search should match through either:

- structured connection evidence
- restaurant tag evidence

But restaurant eligibility should still require the restaurant to have at least one menu-item row somewhere in `core_restaurant_items`.

### Query shape

For restaurant results:

- widen the restaurant query to match:
  - `core_restaurant_items` as today
  - `core_restaurant_entity_signals` for requested food / food attribute / restaurant attribute entity IDs
- still require the restaurant to have at least one menu-item-backed row in `core_restaurant_items`

For dish results:

- keep dish query based on `core_restaurant_items` only

This means:

- restaurant results can match through tags, but only for restaurants that already have menu-item inventory
- food/dish result cards remain backed by actual menu-item rows

### Ranking

For v1:

- do not make tags a separate fallback lane
- include tag matches directly in the restaurant query
- continue ordering primarily by restaurant score

Important note:

- tag evidence should be an eligibility/input signal
- restaurant ranking should still be anchored on existing restaurant ranking fields
- avoid building a second tag-ranking system in phase 1

Guardrail:

- tag matches should only widen restaurant eligibility
- they should not cause synthetic dish rows or dish-result matches
- dish cards must remain backed by `core_restaurant_items`
- dish cards must remain backed by `core_restaurant_items`

### Response shape

Restaurant results should expose evidence so the UI can explain why the restaurant matched:

- `matchEvidenceType`: `connection` | `tag_signal` | `mixed`
- `matchedTags`: top matching tags with counts
- `hasMenuItems`: boolean

Implemented in API response:

- `matchEvidenceType`
- `matchedTags`
- `hasMenuItems`

Restaurants without menu-item rows should not be returned in v1.

## UI behavior

### Search results

Restaurant cards should support both:

- top-dish presentation when `hasMenuItems = true`
- tag-pill presentation when the match is tag-only

Examples:

- `Known for tacos`
- `coffee · 6 mentions`
- `brunch · 4 mentions`

### Profile

Add a tag section sourced from `core_restaurant_entity_signals`.

Display:

- top N tags by `mention_count`
- optional entity-type grouping later

Phase 1 recommendation:

- mixed pills across entity types
- badge count on each pill

Examples:

- `taco 3`
- `coffee 6`
- `spicy 12`
- `patio 8`

## LLM in the search loop

### Recommendation

Do not remove the LLM from natural search yet.

The LLM is not needed for query execution itself, but it is still doing real work in the natural-query path:

- extracting foods
- extracting food attributes
- extracting restaurant attributes
- separating restaurant names from descriptive language
- handling multi-intent natural text

Current code path:

- `/Users/brandonkimble/crave-search/apps/api/src/modules/search/search-query-interpretation.service.ts`
- natural search always calls `llmService.analyzeSearchQuery(...)`

### Better direction

Move to a hybrid interpretation model:

1. Deterministic fast path first

- exact restaurant name query
- single-token food/entity query
- exact attribute query
- very short noun-phrase query

2. LLM only when needed

- multi-clause natural language
- ambiguous queries
- mixed restaurant + food + attribute phrasing
- conversational queries

This keeps natural search quality while reducing unnecessary LLM dependency.

### Phase 1 decision

- keep the LLM for natural search
- do not block tag work on removing it
- add “LLM bypass” as a follow-up optimization slice

## Proposed phases

### Phase 1. Schema + ingestion

- add `core_restaurant_entity_events`
- add `core_restaurant_entity_signals`
- write tag signals during ingestion for all supported mention types
- keep existing connection + category replay behavior
- no backfill work
- rerun ingestion from clean state

Exit criteria:

- tag rows are written for menu-item and non-menu-item mentions
- `El Perrito -> taco` style evidence exists in tag form immediately

### Phase 2. Search API

- widen restaurant search to include tag matches
- keep restaurant eligibility gated by existence of at least one menu-item row
- keep dish search connection-only
- return match evidence + tag chips in API response

Exit criteria:

- `taco` restaurant search can surface restaurants whose taco evidence is tag-backed and which already have menu-item inventory
- dish results remain connection-backed

### Phase 3. UI

- add tag pills to restaurant cards and profile
- show matched tags without fabricating dish rows
- keep menu items and tags visually distinct

Exit criteria:

- result cards and profiles can render tag-backed context cleanly while restaurant eligibility still requires menu-item inventory

### Phase 4. Naming cleanup

- rename `Connection` / `core_connections` to `RestaurantItem` / `core_restaurant_items`
- preserve compatibility layer during migration if needed

Exit criteria:

- codebase vocabulary matches actual data semantics

### Phase 5. Search interpretation optimization

- add deterministic parser/bypass before the LLM path
- only invoke LLM for ambiguous natural queries

Exit criteria:

- exact/simple entity searches do not require LLM
- natural mixed-intent queries still work

## Resolved decisions

- Return matched tags in one combined list and let the client truncate.
- Keep aggregate tag storage count-only; provenance stays in event tables.
- Keep restaurant eligibility gated by real menu-item inventory.
- Use `mentioned for` style tag chips on restaurant cards when query tags matched.

## Recommended first implementation slice

Start with:

- `core_restaurant_entity_events`
- `core_restaurant_entity_signals`
- ingestion writes
- restaurant search widened to tag signals

Do not start with:

- `core_restaurant_items` rename
- decayed tag scoring
- removing the LLM from search

That gives the product the new capability quickly without mixing too many migrations into one cutover.
