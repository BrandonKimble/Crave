---
name: display-rank-scores
description: Per-city display rank scores with deterministic top-100
---

# Plan

Implement per-city display rank scores (0-100, one decimal) for restaurants and dishes using a separate rank score store, with deterministic single-100 behavior and percentile-based colors. Refresh ranks after collection runs only.

## Requirements

- Per location_key (coverage_key) rank scores for restaurants and dish connections.
- Display score uses 1 decimal; exactly one 100 per location/type.
- Color gradient driven by high-precision percentile (not list index).
- Refresh on collection completion only (same cadence as quality scores).
- Keep quality scores internal; UI uses display rank score.
- Only show coverage label UI when results span multiple coverage keys.
- Keep global fallback for missing location_key and log loudly to identify sources.
- Rely on Google Place ID collision merges to collapse cross-coverage restaurant duplicates; keep merge direction stable (existing owner stays canonical).

## Scope

- In: rank computation, storage, refresh triggers, API response fields/types, mobile display and gradients.
- Out: changes to core quality score formulas or search ordering (unless later required).

## Files and entry points

- apps/api/src/modules/content-processing/quality-score/quality-score.service.ts
- apps/api/src/modules/content-processing/reddit-collector/\* (collection completion hooks)
- apps/api/src/modules/polls/poll-aggregation.service.ts
- apps/api/src/modules/polls/poll-category-replay.service.ts
- apps/api/src/modules/search/search-query.builder.ts
- apps/api/src/modules/search/search-query.executor.ts
- packages/shared/src/types/search.ts
- apps/mobile/src/screens/Search/utils/quality.ts
- apps/mobile/src/screens/Search/components/restaurant-result-card.tsx
- apps/mobile/src/screens/Search/components/dish-result-card.tsx
- apps/api/prisma/schema.prisma (new table)

## Data model / API changes

- Add a rank score store (new table, no core-table columns) keyed by:
  - location_key (coverage_key), subject_type (restaurant|connection), subject_id
  - rank_score_raw, rank_score_display, rank_percentile, computed_at
- Add response fields like displayScore and displayPercentile for food and restaurants.
- Include coverageKey per restaurant/connection result and the resolved search coverageKey in metadata for cross-coverage detection.

## Action items

[ ] Confirm tie-breakers for deterministic ranking (quality_score desc, total_upvotes desc, mention_count desc, id asc).
[ ] Define rank mapping: row_number-based with rank=1 => 100.0, others capped to <= 99.9; store a high-precision percentile for color.
[ ] Add rank score table + indices; include location_key and computed_at.
[ ] Implement rank recompute queries per location_key for restaurants and connections (connection scoped by restaurant location_key/coverage_key).
[ ] Confirm multi-location coverage_key semantics are used consistently (no per-location ranking; one rank per entity/connection).
[ ] Wire refresh triggers after chronological and keyword collection completion.
[ ] Update search pipeline to join rank table and emit displayScore/displayPercentile; update shared types.
[ ] Update mobile UI to use displayScore and map colors by displayPercentile.
[ ] Add conditional coverage label UI when results include multiple coverage keys (compare item coverageKey to metadata coverageKey).
[ ] Add loud logging when entity resolution falls back to location_key = global (include pipeline, subreddit, and batch/source identifiers).
[ ] Confirm google_place_id collision merge direction stays with the existing canonical entity and add cross-coverage merge logging for visibility.

## Testing and validation

- yarn workspace api lint
- SQL spot checks per city/type: min=0, max=100, only one 100.
- Verify colors stable across pagination and reflect score gaps.

## Risks and edge cases

- Small city cohorts can make ranks volatile or overly coarse.
- Poll-driven decayed score changes will not be reflected until the next collection run.
- Rank refresh cost if recomputed too often across many cities.

## Open questions

- Should we compute ranks from stored quality scores only, or from current decayed metrics at refresh time?
- If a search bounds query spans multiple coverage_keys, do we still use each entity's own location_key rank, or apply a single coverage_key override?
