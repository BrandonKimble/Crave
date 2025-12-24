---
name: poll-first-coverage-registry
description: Coverage registry + poll-first city scaffolding
---

# Plan

Turn the subreddits table into a true coverage registry, make polls coverage-keyed (not free-text city), and enable poll-first cities to create entities and scores without Reddit ingestion.

## Requirements

- Rename the current subreddits table/model to represent coverage areas, not just Reddit.
- Add `sourceType` with values: `all` (reddit + polls) and `poll_only`.
- Polls must use coverageKey everywhere (no global fallback).
- Poll options can create or resolve restaurants, dishes, and attribute entities directly (no LLM).
- Poll votes can update quality scores and display ranks even in poll-only cities.
- Restaurants created from polls are validated with Google Places and place ID before poll creation/option submission.
- Restaurant validation uses the same Places matching logic as ingestion (autocomplete + find-place fallback, location bias).
- Poll demand seeding uses existing entity-backed search logs only (defer intent logs).
- Poll scope is derived from the current map viewport; no consumer dropdown or free-text city input.
- Polls overlay is persistent in the Search map when search is inactive (collapsed/peek state).
- Poll sheet title includes location display name (short form) and live poll count.
- Poll topic description/body is required (moderated) for all poll types.

## Scope

- In: schema/model renames, coverage registry updates, poll entity seeding, poll-driven scoring refresh, search-demand extensions, poll UX decisions, and API wiring.
- Out: new ranking formulas, changes to the existing quality score math, or new non-poll ingestion pipelines.

## Data model and migrations

- Rename `collection_subreddits` to `coverage_areas` (or `coverage_registry`).
  - Prisma model rename: `Subreddit` -> `CoverageArea`.
  - Columns to keep: `name`, `location_name`, `coverage_key`, viewport, center, safe_interval_days, is_active.
  - Add enum `CoverageSourceType` with values `all` and `poll_only`.
  - Add `sourceType` column (default `all`).
- Polls and poll topics:
  - Repurpose `polls.city` and `poll_topics.city` to always store `coverageKey`.
  - Add `locationName` (or use registry join) for display. Consider `displayName` or a computed short label (before comma).
  - Update API responses to return both `coverageKey` and `locationName`.
  - Add poll topic targets for attributes (e.g., `targetFoodAttributeId`, `targetRestaurantAttributeId`) or store in metadata.
- Search demand:
  - Use existing `user_search_logs` only (no intent logs for now).

## Services and flow changes

- Coverage registry usage:
  - Update `CoverageKeyResolverService` and all `subreddit` lookups to use the renamed model.
  - For Reddit ingestion and on-demand collectors, filter `sourceType = all` only.
- Polls:
  - Derive `coverageKey` from map viewport bounds (server-side resolver).
  - For new cities, auto-create `coverage_areas` entries (sourceType = poll_only) using reverse geocode.
  - Trigger auto-create on poll fetch and on search submit if no coverage match.
  - Before creating, reuse the coverageKey from an existing coverage viewport that contains the center point (roll-up behavior).
  - Add `PollEntitySeedService` to resolve/create:
    - Restaurants scoped to `coverageKey` (after Places validation).
    - Dishes and attributes (food_attribute, restaurant_attribute) kept global.
    - Connections (restaurant + dish) plus attribute attachment for poll types.
    - Uses `AliasManagementService.validateScopeConstraints` for attribute scope checks.
    - Performs case-insensitive lookup by name/type/locationKey before creating new entities.
  - Replace `OnDemandRequestService` usage in `PollsService.addOption` for unresolved poll options (polls should seed entities directly).
  - Normalize poll option labels into entity names and alias metadata.
  - Use Google Places lookup for new restaurants with location bias from the poll location/map.
    - Reuse ranking/matching from `RestaurantLocationEnrichmentService` (`googlePlacesService.autocompletePlace` + `findPlaceFromText` fallback).
    - On success: create restaurant entity + primary location with `googlePlaceId`.
    - On failure: block poll creation/option submit with a clear error.

## Restaurant validation details (poll creation + option add)

- Build a single resolver in `PollEntitySeedService` for restaurant inputs:
  - Normalize name + optional city/region into the query string (same as enrichment).
  - Use `googlePlacesService.autocompletePlace` with `locationBias` from map center + radius.
  - Rank candidates using the same scoring logic as enrichment (name similarity + locality match).
  - If no acceptable candidates, fallback to `findPlaceFromText` with `locationBias`.
  - Fetch place details and require a valid `placeId`.
  - If `google_place_id` already exists:
    - Use the canonical entity; do not create a new restaurant.
    - Proceed with poll option creation using the canonical `entityId`.
  - If no existing placeId:
    - Create the restaurant entity with `locationKey = coverageKey`.
    - Create a primary `restaurant_location` row from place details.
    - Optionally queue full enrichment (attributes, hours, etc) via `RestaurantLocationEnrichmentService`.
  - If no placeId or details are missing, block the submission with a clear error.
- Poll-driven scoring refresh:
  - After `PollAggregationService` updates signals, call:
    - `QualityScoreService.updateQualityScoresForConnections` for affected connections.
    - `RankScoreService.refreshRankScoresForLocations` for the affected coverage keys.
  - Apply this for `sourceType = all` and `poll_only`.
  - Also refresh after `PollCategoryReplayService` replays aggregates.
  - Coalesce refresh per coverageKey (e.g., 30–60 min window) to avoid repeated recomputes.
  - For restaurant-attribute polls, increment `entity.generalPraiseUpvotes` (scaled by consensus) and recompute restaurant quality score.
- Poll content structure:
  - Template-driven titles with structured blanks for dish/restaurant/attribute types.
  - Do not include `{city}` in titles (location is implied by viewport).
  - Required description/body field for context (moderated).
  - Consider phase-2 discussion threads if engagement warrants.
  - Use Google Cloud Natural Language moderation API for titles/descriptions.
    - https://docs.cloud.google.com/natural-language/docs/moderating-text
  - Add a small allow-list for common food slang to reduce false positives.

## Coverage row creation flows

- Updated onboarding flow (coverage rows sourced from subreddits):
  - Use Google Places text search (geocode-first) to fetch viewport + address components.
  - Compute canonical coverageKey from locality + region + country (prefer locality over sublocality).
  - Always use the canonical key; drop manual coverageKey overrides.
  - If locality is missing, fall back to existing viewport coverageKey; otherwise skip creation and log.
  - Set `displayName` from locality (short label) and `locationName` from full formatted address.
  - Set `sourceType = all` for subreddit-backed rows.
- Poll-only auto-create flow:
  - Trigger on poll fetch and on search submit if no coverage match.
  - Reverse-geocode map center first to get locality/region/country + bounds.
  - Compute canonical coverageKey from locality + region + country.
  - If locality is missing, attempt roll-up by checking if center is inside an existing coverage viewport.
  - If locality is missing and no roll-up match exists, skip creation and log (avoid sub-area keys).
  - Upsert coverage row with `sourceType = poll_only`, `displayName`, `locationName`, and viewport (idempotent).
- Shared utilities:
  - Use a shared coverageKey/label builder for onboarding + auto-create to avoid drift.
  - Make auto-create idempotent by `coverageKey` upsert.

## UX decisions to lock in

- Poll location source:
  - Default to the current map viewport coverage key.
  - If unresolved, attempt reverse geocode + auto-create a poll_only coverage entry.
  - Avoid consumer dropdowns and free-text city input (admin only).
- Poll entry points:
  - Polls overlay is a persistent collapsed sheet on the Search map when search is inactive.
  - Polls overlay inherits the current map coverage key and updates only when the resolved coverageKey changes.
  - Reuse the existing Polls overlay component and its lowest snap point as the "peek" state.
  - Optional shortcut from Autocomplete when no results: "Create a poll for this city."
- User-generated polls:
  - Template-based creation flow with a template list UI (Airbnb-style cards, left icon in rounded square).
    - Reference: `apps/mobile/images/Screenshot 2025-12-23 at 6.18.35 PM.png` (expanded list), `apps/mobile/images/Screenshot 2025-12-23 at 6.20.13 PM.png` (collapsed selection).
  - After selection, collapse to a compact row showing the chosen template name + change action.
- Template set (initial):
  - Best {Dish} (best_dish)
  - What to order at {Restaurant} (what_to_order)
  - Best {Dish Attribute} dish (best_dish_attribute)
  - Best {Restaurant Attribute} restaurants (best_restaurant_attribute)
  - Defer: "Best {Dish Attribute} to order at {Restaurant}" until later.
  - Enforce moderation and rate limits; all polls allow user additions (no toggle).

## Action items

[ ] Rename `collection_subreddits` table and Prisma model to coverage registry naming.
[ ] Add `CoverageSourceType` enum and `sourceType` column with defaults.
[ ] Update coverage resolver and all `subreddit` queries to use new model.
[ ] Update poll list and poll creation to use `coverageKey` derived from viewport.
[ ] Add `locationName`/display label in poll responses (registry join or `displayName` column).
[ ] Implement `PollEntitySeedService` and call from `PollsService.addOption`.
[ ] Wire Google Places enrichment for poll-created restaurants.
[ ] Add poll-driven quality score and rank refresh hooks.
[ ] Update mobile polls UI to use map-derived scope and a persistent collapsed sheet.
[ ] Remove poll city text input; replace with "Polls in {displayName} · {count} live" header.
[ ] Add a full-width (within sheet padding) rounded "New poll" button directly under the header, with centered plus icon + label.
[ ] Match button height + corner radius to the Search results toggle control.
[ ] Add a poll creation overlay sheet (shared bottom-sheet component) triggered by the "+" button.
[ ] Add poll description/body text to each poll card and style using shared text styles.
[ ] Remove admin manual poll UI (Profile screen) and manual poll endpoint if no longer needed.
[ ] Build poll creation sheet with template list UI + collapsed selected state (see image references).
[ ] Add autocomplete + custom entry flow for dish, restaurant, dish attribute, and restaurant attribute inputs.
[ ] Ensure custom dish/attribute inputs create global entities via PollEntitySeedService (origin = poll).
[ ] For any restaurant input (poll creation or option add), validate on poll submit via Google Places with location bias; create entity if found, otherwise block.
[ ] Use RestaurantLocationEnrichmentService for restaurant validation to match ingestion behavior (autocomplete + find-place fallback).
[ ] Add per-template handling in PollsService.addOption to map attributes to connection.foodAttributes or restaurant.restaurantAttributes.
[ ] Require poll descriptions in create flows and enforce moderation.
[ ] Add poll templates for attributes and map them to attribute entities.
[ ] Add auto-create coverage trigger for poll fetch + search submit (no poll creation trigger).
[ ] Make auto-create idempotent via coverageKey upsert to prevent duplicate rows.
[ ] Add reverse-geocode helper/service for coverage auto-create.
[ ] Update onboarding script to prefer canonical locality coverageKey, drop manual override, and set displayName/sourceType.
[ ] Extend PollTopicType and PollTopic targets for attribute polls.
[ ] Update poll scheduler question builders to remove `{city}` from titles.
[ ] Expand poll DTOs + API payloads to accept/return attribute targets and coverageKey (rename city field).

## Template mapping details

- Best {Dish} (best_dish)
  - Required: dish (food entity).
  - Options: restaurants.
  - On option add: ensure restaurant exists (Places validation if custom), set `categoryId = dishId` for poll category aggregates.
- What to order at {Restaurant} (what_to_order)
  - Required: restaurant (Places validation).
  - Options: dishes.
  - On option add: ensure dish exists (create if custom), create connection if needed.
- Best {Dish Attribute} dish (best_dish_attribute)
  - Required: dish attribute (food_attribute entity, scope-validated).
  - Options: dish + restaurant.
  - On option add: ensure dish + restaurant exist, create connection, append attributeId to connection.foodAttributes.
- Best {Restaurant Attribute} restaurants (best_restaurant_attribute)
  - Required: restaurant attribute (restaurant_attribute entity, scope-validated).
  - Options: restaurants.
  - On option add: ensure restaurant exists, append attributeId to restaurant.restaurantAttributes, increment generalPraiseUpvotes.

## Risks and edge cases

- Table rename touches many services (ingestion, on-demand, coverage resolver).
- Poll-only cities need a coverage registry entry, or polling will default to global.
- Poll entity creation can introduce same-name collisions without place IDs.
- Search-intent logs could inflate demand without matching real entities.

## Open questions

- Should food entities remain global, or become coverage-scoped for poll-only cities?
- Do we want a "request city" flow that creates a poll-only coverage entry beyond reverse geocode?
