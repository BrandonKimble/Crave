\c crave_search

-- 1. Recently mentioned foods with food ids
SELECT c.food_id,
       f.name AS food_name,
       c.restaurant_id,
       r.name AS restaurant_name,
       c.last_mentioned_at
FROM core_restaurant_items c
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

-- 4. Collection communities
-- CORRECTED 2026-08-03 (pass-2 audit, executed RED: `relation
-- "collection_subreddits" does not exist`). The table is
-- `collection_communities` now, and it carries NO center_latitude /
-- center_longitude — community geography moved to the place catalog, so
-- there is no successor column to substitute. Ask the catalog for
-- coordinates, not this table.
SELECT community_name, location_name, is_active, last_processed
FROM collection_communities
ORDER BY community_name;

-- 5. Top restaurants (by v3 public Crave Score)
SELECT r.entity_id,
       r.name,
       pes.display_score AS crave_score
FROM core_entities r
LEFT JOIN core_public_entity_scores pes
  ON pes.subject_id = r.entity_id
  AND pes.subject_type = 'restaurant'::crave_score_subject_type
WHERE r.type = 'restaurant'
ORDER BY pes.display_score DESC NULLS LAST
LIMIT 5;

-- 6. Rooms for on-demand tests (rest attr + few results)
SELECT entity_id, name
FROM core_entities
WHERE type = 'restaurant_attribute'
  AND name ILIKE '%patio%'
LIMIT 5;

-- 7. Keyword job stats (most recent)
-- CORRECTED 2026-08-03 (pass-2 audit, executed RED: `relation
-- "keyword_search_triggers" does not exist`). Successor:
-- collection_keyword_attempt_history, keyed by engine + normalized term.
SELECT engine_name, normalized_term, last_attempt_at, last_success_at,
       last_outcome, last_result_count
FROM collection_keyword_attempt_history
ORDER BY last_attempt_at DESC NULLS LAST
LIMIT 5;
