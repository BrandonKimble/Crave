---
name: multi-location-enrichment
description: Multi-location Google enrichment and UI updates
---

# Plan

Implement multi-location support for restaurants by extending Google Places enrichment to collect and store additional locations (address/lat/lng/phone/website/hours) while removing reliance on `is_primary` and excluding placeholder locations from search responses. Update API query selection to compute a representative location at query time (closest to search center) and update mobile UX to display multiple pins for a single ranked restaurant without creating multiple profiles.

## Requirements

- After primary enrichment succeeds, use Places Text Search with `locationRestriction` (rectangle) to fetch up to Google’s cap (<=60) for additional locations and upsert them (dedupe by placeId, no dependency on `is_primary`, handle `pageToken` pagination).
- Expand preferred place type filtering for primary-place selection to include the full set of Table A Food and Drink types (embedded below). Keep `includedType` for Text Search restricted to Table A only.
- Use `includedType` derived from the primary place’s `primaryType` with `strictTypeFiltering=true`; if no suitable primary type is available, omit `includedType` entirely (do not guess from `types` order). Filter results to exact/brand-level name matches (normalized equality or canonical-prefix match with delimiter-aware parsing), using the canonical Google name only (no alias matching).
- Store only the fields needed for secondary locations: place ID, address, lat/lng, phone, website, and hours; avoid price-level/price-range/types metadata.
- Store hours in the same normalized JSON shape currently used in restaurant metadata so existing parsing logic applies; compute open status per location using its own stored UTC offset/timezone when available.
- Stop relying on `is_primary` for ranking; compute a representative location per query (closest to search center) while returning the full location list for map pins.
- Exclude placeholder locations (subreddit centroids / missing address) from user-facing results and from multi-location aggregation.
- Replace `apps/api/scripts/calculate-volumes.ts` with an onboarding script (e.g., `apps/api/scripts/onboard-subreddit.ts`) that accepts a subreddit name and optional center lat/lng, inserts/updates the row, runs the volume calculation, and fetches the city viewport via Google Place Details to populate new viewport columns.
- Suggestions UI: restaurant autocomplete row shows “<N> locations” under the name (second-smallest text); selecting it recenters the map to show all locations in the city and opens the profile sheet.
- Results UI: keep the original search viewpoint; selecting a multi-location restaurant temporarily zooms to all its locations behind the profile sheet; exiting returns to the prior viewpoint/results pins.
- Restaurant profile UI: add a locations section with expandable rows; row label uses street name, open status on the right (computed from primary metadata), and expanded content shows full address, per-location phone, per-location hours, and per-location website if websites differ (otherwise keep a single shared website button).

## Table A Food and Drink types (preferred list)

```text
acai_shop
afghani_restaurant
african_restaurant
american_restaurant
asian_restaurant
bagel_shop
bakery
bar
bar_and_grill
barbecue_restaurant
brazilian_restaurant
breakfast_restaurant
brunch_restaurant
buffet_restaurant
cafe
cafeteria
candy_store
cat_cafe
chinese_restaurant
chocolate_factory
chocolate_shop
coffee_shop
confectionery
deli
dessert_restaurant
dessert_shop
diner
dog_cafe
donut_shop
fast_food_restaurant
fine_dining_restaurant
food_court
french_restaurant
greek_restaurant
hamburger_restaurant
ice_cream_shop
indian_restaurant
indonesian_restaurant
italian_restaurant
japanese_restaurant
juice_shop
korean_restaurant
lebanese_restaurant
meal_delivery
meal_takeaway
mediterranean_restaurant
mexican_restaurant
middle_eastern_restaurant
pizza_restaurant
pub
ramen_restaurant
restaurant
sandwich_shop
seafood_restaurant
spanish_restaurant
steak_house
sushi_restaurant
tea_house
thai_restaurant
turkish_restaurant
vegan_restaurant
vegetarian_restaurant
vietnamese_restaurant
wine_bar
```

## Scope

- In: Google multi-location enrichment, API query adjustments, location filtering, and mobile map/profile UX updates.
- Out: Annual refresh job, advanced >60 location pagination/tiling beyond the Google cap, and deep per-location scheduling/operations.

## Files and entry points

- `apps/api/src/modules/restaurant-enrichment/restaurant-location-enrichment.service.ts`
- `apps/api/src/modules/external-integrations/google-places/google-places.service.ts`
- `apps/api/src/modules/search/search-query.builder.ts`
- `apps/api/src/modules/search/search-query.executor.ts`
- `apps/api/src/modules/search/search.service.ts`
- `apps/api/src/modules/content-processing/reddit-collector/unified-processing.service.ts`
- `apps/api/prisma/schema.prisma` (plus migration)
- `apps/api/scripts/calculate-volumes.ts` → `apps/api/scripts/onboard-subreddit.ts`
- `apps/mobile/src/screens/Search/index.tsx`
- `apps/mobile/src/overlays/RestaurantOverlay.tsx`

## Data model / API changes

- Remove or deprecate `is_primary` usage in query selection (keep field temporarily or remove via migration if accepted).
- Remove `price_level`, `price_range`, and `price_level_updated_at` from `core_restaurant_locations` (entity-level price is sufficient); stop populating these fields for secondary locations immediately.
- Add explicit fields for phone, website, hours, and UTC offset/timezone (or a constrained hours JSON column plus offset/timezone) so secondary locations do not rely on full metadata blobs; keep hours format aligned with existing restaurant metadata `hours`.
- Persist `primaryType` from the primary Google place details (e.g., inside `restaurantMetadata.googlePlaces`) for reuse in multi-location searches.
- Store city coverage bounds (rectangle) alongside subreddit metadata (e.g., in `collection_subreddits`) to drive `locationRestriction` (new columns for viewport NE/SW lat/lng).

## Action items

[ ] Specify the minimal location schema (place ID, address, lat/lng, phone, website, hours, utcOffsetMinutes/timezone) and drop price fields from `core_restaurant_locations` (update Prisma + migrations).
[ ] Define and store city coverage rectangles (new bounds columns on `collection_subreddits`) populated via Google Place Details `viewport` for the city.
[ ] Expand preferred place type filtering for primary-place selection (autocomplete and fallback) to include all Table A Food and Drink types (embedded above); keep a curated list in code and add tests around candidate selection.
[ ] Extend Google Places integration with a multi-location search helper using `locationRestriction` (rectangle) + `includedType`/`strictTypeFiltering` derived from the primary place `primaryType`, plus a reduced field mask (location, address, website, phones, hours, utcOffsetMinutes/timeZone) and a post-filter for exact/brand-level name matches (canonical only, delimiter-aware).
[ ] Add post-primary enrichment step to fetch additional locations (paginate up to 60), upsert them (dedupe by placeId, skip primary placeId), and convert the existing placeholder location row into the real Google location when present (no leftover placeholders).
[ ] Update Google Place Details to request `primaryType` and `viewport` and persist both in restaurant metadata / subreddit onboarding.
[ ] Replace `calculate-volumes.ts` with an onboarding script that:
[ ] - takes a subreddit name (and optional center lat/lng),
[ ] - creates/updates the `collection_subreddits` row,
[ ] - runs the volume calculation job,
[ ] - calls Google Place Details to store the city viewport bounds.
[ ] Audit `normalizeGoogleOpeningHours` and align secondary-location hours storage to the same normalized JSON shape used by restaurant metadata.
[ ] Update search SQL selection to compute a representative location per restaurant (closest to search center) and exclude placeholder locations from `locations_json`.
[ ] Update search result mapping to carry the full location list for pins and the computed representative location for ranking/card summaries.
[ ] Add autocomplete row UX: show “<N> locations” under restaurant name and recenter map to all locations on selection, then open profile sheet.
[ ] Update results-list UX: selecting multi-location restaurant temporarily zooms to its locations behind the profile sheet; exiting restores the prior viewpoint and results pins.
[ ] Update restaurant profile UI to render a locations section with expandable rows (street label + open status summary; on expand show full address, hours, phone, and website if unique per location).

## Testing and validation

- API: `yarn workspace api lint` and targeted tests for search query selection (distance-based representative location + location filtering).
- Mobile: verify map pins for multi-location restaurant, selection UX, and profile address/website rendering on iOS simulator.
- Data: SQL spot-check to ensure placeholder locations are excluded from responses and that multi-location upserts are deduped.

## Risks and edge cases

- Google Places result coverage might miss locations if the rectangle or query semantics are too narrow (no fallback to `locationBias`).
- Increased API usage and rate limits when fetching multi-location data.
- Breaking changes if `is_primary` or price-level fields are removed without coordinated client updates.
- Some locations may share the same website/phone; ensure UI handles duplicates cleanly.
- Open-now accuracy per location may be limited without storing per-location timezone/utc offsets.

## Open questions

- Do we want to remove `is_primary` entirely now or keep it for a transition period?
- Where should hours live: structured columns vs a constrained JSON field?
- How do we source the rectangle bounds for `locationRestriction` (manual map bounds vs a stored city viewport from an external dataset)?
- Which primary place type should be used for `includedType` if multiple types are present?
