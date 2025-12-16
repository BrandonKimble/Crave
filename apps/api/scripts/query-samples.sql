\c crave_search

-- 1. Recently mentioned foods with food ids
SELECT c.food_id,
       f.name AS food_name,
       c.restaurant_id,
       r.name AS restaurant_name,
       c.last_mentioned_at
FROM core_connections c
JOIN core_entities f ON f.entity_id = c.food_id
JOIN core_entities r ON r.entity_id = c.restaurant_id
ORDER BY c.last_mentioned_at DESC
LIMIT 5;

-- 2. Restaurant attributes available
SELECT entity_id, name
FROM core_entities
WHERE type = 'restaurant_attribute'
LIMIT 5;

-- 3. Food attributes available
SELECT entity_id, name
FROM core_entities
WHERE type = 'food_attribute'
LIMIT 5;

-- 4. Subreddits with coordinates
SELECT name, center_latitude, center_longitude
FROM collection_subreddits
ORDER BY name;

-- 5. Top restaurants (by quality score)
SELECT entity_id, name, restaurant_quality_score
FROM core_entities
WHERE type = 'restaurant'
ORDER BY restaurant_quality_score DESC NULLS LAST
LIMIT 5;

-- 6. Rooms for on-demand tests (rest attr + few results)
SELECT entity_id, name
FROM core_entities
WHERE type = 'restaurant_attribute'
  AND name ILIKE '%patio%'
LIMIT 5;

-- 7. Keyword job stats (most recent)
SELECT *
FROM keyword_search_triggers
ORDER BY last_triggered_at DESC
LIMIT 5;
