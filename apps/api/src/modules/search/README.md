# Search Module API

## Environment Flags

- `SEARCH_ALWAYS_INCLUDE_SQL_PREVIEW` (default `false`): when `true`, every `/search/run` response includes the serialized SQL/Prisma preview even if the client doesn’t set `includeSqlPreview`.
- `SEARCH_VERBOSE_DIAGNOSTICS` (default `false`): enables additional executor logging (counts, open-now coverage) for debugging environments.
- `SEARCH_ON_DEMAND_COOLDOWN_MS` (default `300000`): minimum time between repeated keyword triggers for the same targets/bounds combo.
- `SEARCH_ON_DEMAND_MIN_RESULTS` (default `SEARCH_DEFAULT_PAGE_SIZE`): threshold of restaurant results below which on-demand keyword collection runs (only if food entities/attributes were provided).
- `SEARCH_ON_DEMAND_MAX_ENTITIES` (default `5`): max number of entities queued for a single on-demand keyword cycle.
- `SEARCH_OPEN_NOW_FETCH_MULTIPLIER` (default `4`): how many pages of results to prefetch when `openNow` is requested so closed restaurants can be filtered before pagination.
- `KEYWORD_SEARCH_LIMIT`, `KEYWORD_SEARCH_SORTS`: Reddit search limits/sorts for keyword jobs. Cadence itself is planned by `CollectionSchedulerService` via `collection_schedules` rows (`COLLECTION_SCHEDULER_ENABLED`).

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

When a query supplies food entities/attributes but returns fewer than `SEARCH_ON_DEMAND_MIN_RESULTS` restaurants, the API can automatically enqueue keyword search cycles for the overlapping `collectableMarketKeys` resolved from the viewport. A market only counts as collectable when it has an active linked community target in `collection_communities`; markets without linked communities still accumulate search demand and support polls, but they do not enqueue Reddit collection work.

Search responses now distinguish two different coverage concepts in metadata:

- `resultCoverageStatus`: whether the returned results fully satisfied the search intent (`full`, `partial`, `unresolved`)
- `marketResolutionStatus`: whether the viewport resolved to one market, multiple overlapping markets, no market, or an error (`resolved`, `multi_market`, `no_market`, `error`)

## POST /search/plan

Returns the query plan plus (optionally) the SQL preview without executing the database query. Honors the same `includeSqlPreview` request flag and environment override as `/search/run`.
