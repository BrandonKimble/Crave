# Search Module API

## Environment Flags

- `SEARCH_ALWAYS_INCLUDE_SQL_PREVIEW` (default `false`): when `true`, every `/search/run` response includes the serialized SQL/Prisma preview even if the client doesn’t set `includeSqlPreview`.
- `SEARCH_VERBOSE_DIAGNOSTICS` (default `false`): enables additional executor logging (counts, open-now coverage) for debugging environments.

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
  }
}
```

## POST /search/events/click
```json
{ "entityId": "uuid-food", "entityType": "food" }
```
Records a user selection so `entity_priority_metrics` can learn from demand signals.
