# On-Demand Collection: Viewport, Location, Cooldowns, Messaging

## Summary

We want to:

- avoid on-demand spam from tiny viewports or repeated map moves,
- make on-demand collection location-aware so we do not search every subreddit unnecessarily,
- make restaurant entities location-aware so same-name restaurants in different cities are distinct,
- apply a long refresh window based on subreddit activity (and an even longer window when we see no results),
- show user messaging only when on-demand is actually queued, with dynamic query text and ETA.

Implementation is on hold while we finalize thresholds and location rules.

## Current behavior (as implemented)

### Trigger and dedupe

- On-demand requests are de-duplicated globally by (term, entityType, reason).
- Requests are stored in `collection_on_demand_requests` and upserted, which increments `occurrenceCount` and updates `lastSeenAt`.
- A request only runs when status is `pending`; `queued`/`processing`/`completed` do not re-run.
- There is a short "instant" cooldown (default 5 minutes) stored in metadata for backpressure.
- Autocomplete requests do not include bounds today, so any on-demand triggered there is location-agnostic.
- Restaurant entities are globally unique by (name, type), so same-name restaurants are merged today.

### Location selection

- On-demand uses bounds/user location (if present) to select the nearest subreddit.
- If no bounds/location or no subreddit centers are available, it falls back to all active subreddits, trying them in order until it finds results.
- Planned change: require a resolvable locationKey; if missing, record demand but do not enqueue.

### Reddit search mechanics

- On-demand uses keyword search.
- Default sorts: relevance, top, new (configurable via `KEYWORD_SEARCH_SORTS`).
- Limit is up to 1000 per sort, per entity, per subreddit (not a global cap).
- Comments are NOT fetched during the keyword search call itself (the method contains a stub), but comments ARE fetched later during batch processing when we load each post by ID.
  - Cleanup: remove the keyword-search comment stub and update metrics so the keyword-search step is clearly post-only; collection still fetches comments in batch processing.

## Planned changes (approved direction)

### Restaurant entities become location-aware

- Distinguish same-name restaurants by location (subreddit/city key).
- Keep food and attribute entities global.

### Autocomplete bounds

- Autocomplete requests should include bounds/user location so on-demand uses the same location context as a normal search.

### Enqueue only with location

- If no bounds/user location and no locationKey can be resolved, record demand but do not enqueue on-demand.

### Pass location into enrichment

- Bias Google Places lookup with locationKey-derived city/region or location bias from bounds/user location.
- Ensure enrichment selects the closest matching place for that location.
  - Location bias is not propagated today because enrichment only reads entity fields (lat/lng/city/region), which are absent on new placeholders.
  - Planned touchpoints:
    - Extend on-demand processing to pass bounds/userLocation into enrichment calls.
    - Extend unified processing to carry source subreddit bounds or center into enrichment calls.
    - Update `RestaurantLocationEnrichmentService` to accept optional location bias override.

## Schema changes (planned)

- Add a `locationKey` (subreddit or city key) to restaurant entities.
- Adjust uniqueness:
  - Keep `googlePlaceId` unique.
  - Make restaurants unique by (name, type, locationKey) instead of global (name, type).
  - Preserve global uniqueness for non-restaurant entities (food, attributes).
- Add `locationKey` to `collection_on_demand_requests` and include it in uniqueness for restaurant requests.
- Extend entity resolution inputs to include `locationKey` for restaurants.

Notes:

- Prisma does not support partial unique indexes directly; this likely needs a SQL migration to enforce per-type uniqueness.

## Pipeline changes (planned)

- Search query interpretation:
  - Resolve `locationKey` from bounds centroid; fall back to userLocation.
  - Pass `locationKey` into restaurant entity resolution.
  - If unresolved restaurant terms remain, enqueue on-demand with `locationKey`; if locationKey is missing, record demand only.
- Autocomplete:
  - Include bounds/user location so locationKey can be resolved.
  - Do not enqueue on-demand if locationKey is missing.
- Entity resolution:
  - For restaurants, prefer entities whose `locationKey` matches the current request context.
  - Fall back to global matches only when locationKey is missing.
- On-demand processing:
  - Use locationKey in request uniqueness for restaurants.
  - Use locationKey to select the nearest subreddit (no global fallback).
- Unified processing (Reddit ingestion):
  - Use source subreddit as locationKey for restaurant entities created from mentions.
- Restaurant enrichment:
  - Use locationKey-derived city/region or bounds to set Google Places location bias.
  - Add optional `locationBias`/`city`/`region` overrides from request context when entity has no location yet.

## New flow (proposed)

1. User search (or autocomplete tap) sends bounds/user location.
2. Search resolves `locationKey` from bounds centroid; fall back to userLocation.
3. Restaurant entity resolution uses `locationKey` to match/create the correct city-specific restaurant entity.
4. If results are low and locationKey exists, on-demand request is recorded with locationKey and enqueued.
5. On-demand keyword search runs for the nearest subreddit only.
6. If search results yield new entities, restaurant enrichment runs with location bias for that location.
7. Subsequent searches in other cities resolve to different restaurant entities with their own locationKey.

## Remaining open questions

- None for now. Revisit only if we want a different location key strategy or further tuning.

## Suggested rule set (draft)

1. Only queue on-demand when:

- results <= threshold,
- there are entity targets,
- viewport width >= ~1.7-1.8 miles (left-to-right),
- a locationKey can be resolved (bounds or user location); if missing, record demand but do not enqueue,
- not in cooldown window.

2. Cooldown rules:

- Success: cooldown based on subreddit activity (safe interval).
- No results: cooldown = max(60 days, safe interval \* 3).
- Error: short retry window (backoff but not 30 days).

3. Location-aware:

- Resolve `locationKey` from bounds centroid; fall back to userLocation.
- Use `locationKey` in uniqueness for restaurant `low_result` and `unresolved` requests.
- Keep food/attribute `unresolved` requests global.

4. Search configuration:

- Use `new` on the safe interval cadence.
- Run `relevance`/`top` only on the first run or on a long refresh window using safe interval \* 3, with a 60-day floor.
- Time filters:
  - First run for `relevance`/`top`: `t=year`.
  - Refresh for `relevance`/`top`: `t=month` when safe interval <= 10 days, otherwise `t=year`.
  - If the filtered run yields too few results, fall back to a wider window in the same run.

## Decisions (locked)

- Make restaurant entities location-aware via `locationKey`.
- Use `locationKey` = nearest subreddit name (already used in search logs/demand/polls).
- Use `locationBias` = bounds centroid or userLocation (for Google Places matching).
- Use safe interval for the success cooldown window.
- Set no-results cooldown to safe interval \* 3 with a 60-day floor.
- Apply a 60-day floor to `relevance`/`top` refresh cadence as well (safe interval \* 3).
- Add bounds/user location to autocomplete so on-demand is location-aware.
- Do not enqueue on-demand if no locationKey can be resolved (record demand only).
- Pass location context into restaurant enrichment (Google Places bias).
- Clean up keyword-search stubs so comments are only fetched in batch processing.

## Questions to answer before implementation

- None for now.
