# Search Module API

## Environment Flags

- `SEARCH_ALWAYS_INCLUDE_SQL_PREVIEW` (default `false`): when `true`, every `/search/run` response includes the serialized SQL/Prisma preview even if the client doesn’t set `includeSqlPreview`.
- `SEARCH_VERBOSE_DIAGNOSTICS` (default `false`): enables additional executor logging (counts, open-now coverage) for debugging environments.
- `SEARCH_ON_DEMAND_COOLDOWN_MS` (default `300000`): minimum time between repeated keyword triggers for the same targets/bounds combo.
- `SEARCH_ON_DEMAND_MIN_RESULTS` (default `SEARCH_DEFAULT_PAGE_SIZE`): threshold of restaurant results below which on-demand keyword collection runs (only if food entities/attributes were provided).
- `SEARCH_ON_DEMAND_MAX_ENTITIES` (default `5`): max number of entities queued for a single on-demand keyword cycle.
- `KEYWORD_SEARCH_ENABLED`, `KEYWORD_SEARCH_ENTITY_COUNT`, `KEYWORD_SEARCH_INTERVAL_DAYS`, `KEYWORD_SEARCH_LIMIT`, `KEYWORD_SEARCH_POLL_INTERVAL_MS`: control the scheduled keyword enrichment cadence (per-city entity selection—subreddits are pulled from the DB—run frequency, and Reddit search limits).

## POST /search/run

### Request Body
```json
{
  "entities": {
    "food": [
      { "normalizedName": "ramen", "entityIds": ["uuid-food"] }
    ],
    "restaurantAttributes": [
      { "normalizedName": "patio", "entityIds": ["uuid-rest-attr"] }
    ]
  },
  "bounds": {
    "northEast": { "lat": 30.35, "lng": -97.70 },
    "southWest": { "lat": 30.20, "lng": -97.80 }
  },
  "openNow": true,
  "pagination": { "page": 1, "pageSize": 25 },
  "includeSqlPreview": false
}
```

### Response Shape
```json
{
  "format": "dual_list",
  "plan": { "format": "dual_list", "restaurantFilters": [...], "connectionFilters": [...], "ranking": {"foodOrder": "food_quality_score DESC", "restaurantOrder": "contextual_food_quality DESC"}, "diagnostics": {"missingEntities": [], "notes": []}},
  "food": [
    {
      "connectionId": "uuid-conn",
      "foodId": "uuid-food",
      "foodName": "Tonkotsu Ramen",
      "restaurantId": "uuid-restaurant",
      "restaurantName": "Ramen Tatsu-Ya",
      "qualityScore": 87.5,
      "activityLevel": "trending",
      "mentionCount": 12,
      "totalUpvotes": 145,
      "recentMentionCount": 5,
      "lastMentionedAt": "2025-10-24T18:02:00.000Z",
      "categories": [],
      "foodAttributes": []
    }
  ],
  "restaurants": [
    {
      "restaurantId": "uuid-restaurant",
      "restaurantName": "Ramen Tatsu-Ya",
      "contextualScore": 85.2,
      "restaurantQualityScore": 90.1,
      "latitude": 30.321,
      "longitude": -97.742,
      "address": "123 Main St, Austin, TX",
      "topFood": [
        {
          "connectionId": "uuid-conn",
          "foodId": "uuid-food",
          "foodName": "Tonkotsu Ramen",
          "qualityScore": 87.5,
          "activityLevel": "trending"
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

When a query supplies food entities/attributes but returns fewer than `SEARCH_ON_DEMAND_MIN_RESULTS` restaurants, the API automatically enqueues keyword search cycles—first choosing the closest subreddit whose `center_latitude/center_longitude` (stored on the `subreddits` table) matches the request’s bounds/results, then falling back to every active subreddit—so Section 5/7 on-demand enrichment stays fed by real query traffic.

## POST /search/events/click
```json
{ "entityId": "uuid-food", "entityType": "food" }
```
Records a user selection so `entity_priority_metrics` can learn from demand signals.

## POST /search/plan

Returns the query plan plus (optionally) the SQL preview without executing the database query. Honors the same `includeSqlPreview` request flag and environment override as `/search/run`.
