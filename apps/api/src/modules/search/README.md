# Search Module API

## Environment Flags

- `SEARCH_ALWAYS_INCLUDE_SQL_PREVIEW` (default `false`): when `true`, every `/search/run` response includes the serialized SQL/Prisma preview even if the client doesn’t set `includeSqlPreview`.
- `SEARCH_VERBOSE_DIAGNOSTICS` (default `false`): enables additional executor logging (counts, open-now coverage) for debugging environments.
- `SEARCH_OPEN_NOW_FETCH_MULTIPLIER` (default `4`): how many pages of results to prefetch when `openNow` is requested so closed restaurants can be filtered before pagination.
- On-demand tunables are code constants since the 2026-07-11 config fold-in: cooldown 300s + max entities 5 in `on-demand-request.service.ts`, trigger threshold `ON_DEMAND_MIN_RESULTS` (=1) in `on-demand-tuning.constants.ts`, keyword limit/sorts in `keyword-search-orchestrator.service.ts`. Cadence itself is planned by `CollectionSchedulerService` via `collection_schedules` rows (`COLLECTION_SCHEDULER_ENABLED`).

## POST /search/run

### Request Body

```json
{
  "entities": {
    "food": [{ "normalizedName": "ramen", "entityIds": ["uuid-food"] }],
    "restaurantAttributes": [
      { "normalizedName": "patio", "entityIds": ["uuid-rest-attr"] }
    ]
  },
  "bounds": {
    "northEast": { "lat": 30.35, "lng": -97.7 },
    "southWest": { "lat": 30.2, "lng": -97.8 }
  },
  "openNow": true,
  "risingActive": false,
  "pagination": { "page": 1, "pageSize": 25 },
  "includeSqlPreview": false
}
```

> When `risingActive` is `true`, the ranking switches from score to recent momentum: restaurants and dishes are ordered by the Crave Score **rising** surge (`rising DESC NULLS LAST`) with the score-based ordering kept as the tiebreak. `rising` is the recent-vs-baseline display-point delta (the score recomputed on a fast decay half-life minus the all-time score), not a fixed-window snapshot delta. The plan's `ranking` then reports `{"foodOrder": "rising DESC", "restaurantOrder": "rising DESC"}`.

### Response Shape

```json
{
  "format": "dual_list",
  "plan": { "format": "dual_list", "restaurantFilters": [...], "connectionFilters": [...], "ranking": {"foodOrder": "crave_score DESC", "restaurantOrder": "crave_score DESC"}, "diagnostics": {"missingEntities": [], "notes": []}},
  "food": [
    {
      "connectionId": "uuid-conn",
      "foodId": "uuid-food",
      "foodName": "Tonkotsu Ramen",
      "restaurantId": "uuid-restaurant",
      "restaurantName": "Ramen Tatsu-Ya",
      "scoreSubjectType": "connection",
      "scoreSubjectId": "uuid-conn",
      "craveScore": 8.75,
      "rising": 0.6,
      "mentionCount": 12,
      "totalUpvotes": 145,
      "lastMentionedAt": "2025-10-24T18:02:00.000Z",
      "categories": [],
      "foodAttributes": []
    }
  ],
  "restaurants": [
    {
      "restaurantId": "uuid-restaurant",
      "restaurantName": "Ramen Tatsu-Ya",
      "scoreSubjectType": "restaurant",
      "scoreSubjectId": "uuid-restaurant",
      "craveScore": 8.52,
      "rising": -0.4,
      "matchEvidenceType": "mixed",
      "hasMenuItems": true,
      "matchedTags": [
        {
          "entityId": "uuid-food",
          "name": "ramen",
          "entityType": "food",
          "mentionCount": 12
        }
      ],
      "latitude": 30.321,
      "longitude": -97.742,
      "address": "123 Main St, Austin, TX",
      "topFood": [
        {
          "connectionId": "uuid-conn",
          "foodId": "uuid-food",
          "foodName": "Tonkotsu Ramen",
          "scoreSubjectType": "connection",
          "scoreSubjectId": "uuid-conn",
          "craveScore": 8.75,
          "rising": 0.6
        }
      ]
    }
  ],
  "metadata": {
    "totalFoodResults": 134,
    "totalRestaurantResults": 8,
    "queryExecutionTimeMs": 87,
    "boundsApplied": true,
    "openNowApplied": true,
    "openNowSupportedRestaurants": 16,
    "openNowUnsupportedRestaurants": 2,
    "page": 1,
    "pageSize": 25,
    "perRestaurantLimit": 3
  },
  "sqlPreview": "WITH filtered_restaurants AS (...)\nSELECT * FROM filtered_connections ..."
}
```

`sqlPreview` is returned when the request sets `includeSqlPreview: true` or the `SEARCH_ALWAYS_INCLUDE_SQL_PREVIEW` environment flag is enabled. The preview mirrors the SQL executed by the service (includes `WITH filtered_restaurants` / `filtered_connections` CTEs, ORDER BY, LIMIT/OFFSET).

Restaurant rows can now include:

- `matchEvidenceType`: whether the restaurant matched via menu-item connections, tag signals, or both
- `matchedTags`: the matched restaurant-level tags returned for card/profile rendering
- `hasMenuItems`: explicit guard showing the restaurant still has menu-item inventory backing eligibility

When a query supplies food entities/attributes but returns fewer than `ON_DEMAND_MIN_RESULTS` restaurants, the API records the ask and — when at least one ENGINE's territory covers the viewport (engine territory = derived union of member-place grounds, §5) — enqueues per-engine keyword targets. An ask with no covering engine mints no queue row but still records its `on_demand_ask` signal with the viewport geo; the collector's unmet family reads those asks from the ledger by territory (the uncovered-ask lane).

Search responses now distinguish two different coverage concepts in metadata:

- `resultCoverageStatus`: whether the returned results fully satisfied the search intent (`full`, `partial`, `unresolved`)
- `engineCoverageShare` / `engineCoverage`: raw share of the viewport covered by engine territories, plus the engines present (no thresholds — consumers judge)

## POST /search/plan

Returns the query plan plus (optionally) the SQL preview without executing the database query. Honors the same `includeSqlPreview` request flag and environment override as `/search/run`.
