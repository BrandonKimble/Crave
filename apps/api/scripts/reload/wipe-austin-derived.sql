-- FULL-RELOAD WIPE (charter §2c, executed 2026-07-30).
-- Fresh-start scope: wipe the DERIVED layer so re-extraction under the
-- final prompt rebuilds it clean — while PRESERVING every entity and
-- connection that user-generated content references (poll targets, list
-- items, photos, curated lists, on-demand links). Verified counts before
-- writing this: 3,630 poll targets, 3,231 curated items, 646 photo/list
-- refs. Preserved entities stay ACTIVE under their names; the reload
-- re-resolves onto them via the exact-name tier, so user anchors and
-- fresh evidence meet in the middle. Raw truth (source documents,
-- extraction inputs, sources/lanes, users/polls/lists) is untouched.
-- REHEARSED ON LOCAL 2026-07-30: clean single transaction, 670 entities +
-- 288 connections preserved, no FK violations.
BEGIN;

CREATE TEMP TABLE preserved_connections AS
SELECT DISTINCT connection_id FROM (
  SELECT connection_id FROM user_list_items WHERE connection_id IS NOT NULL
  UNION SELECT connection_id FROM photos WHERE connection_id IS NOT NULL
  UNION SELECT connection_id FROM curated_list_items WHERE connection_id IS NOT NULL
) c;

CREATE TEMP TABLE preserved_entities AS
SELECT DISTINCT entity_id FROM (
  SELECT target_dish_id AS entity_id FROM poll_topics WHERE target_dish_id IS NOT NULL
  UNION SELECT target_restaurant_id FROM poll_topics WHERE target_restaurant_id IS NOT NULL
  UNION SELECT target_food_attribute_id FROM poll_topics WHERE target_food_attribute_id IS NOT NULL
  UNION SELECT target_restaurant_attribute_id FROM poll_topics WHERE target_restaurant_attribute_id IS NOT NULL
  UNION SELECT restaurant_id FROM user_list_items WHERE restaurant_id IS NOT NULL
  UNION SELECT restaurant_id FROM photos WHERE restaurant_id IS NOT NULL
  UNION SELECT entity_id FROM curated_list_items WHERE entity_id IS NOT NULL
  UNION SELECT restaurant_id FROM curated_list_items WHERE restaurant_id IS NOT NULL
  UNION SELECT entity_id FROM collection_on_demand_requests WHERE entity_id IS NOT NULL
  UNION SELECT ci.food_id FROM core_restaurant_items ci JOIN preserved_connections pc ON pc.connection_id = ci.connection_id
  UNION SELECT ci.restaurant_id FROM core_restaurant_items ci JOIN preserved_connections pc ON pc.connection_id = ci.connection_id
) e WHERE entity_id IS NOT NULL;

DELETE FROM core_restaurant_item_mentions;
DELETE FROM core_restaurant_entity_events;
DELETE FROM core_restaurant_events;
DELETE FROM core_restaurant_entity_signals;
DELETE FROM derived_food_category_edges;
DELETE FROM derived_entity_sibling_edges;
DELETE FROM demand_scoring_candidates;
DELETE FROM core_restaurant_attribute_evidence
WHERE source_class = 'reddit_evidence'
   OR restaurant_id NOT IN (SELECT entity_id FROM preserved_entities)
   OR attribute_id NOT IN (SELECT entity_id FROM preserved_entities);

DELETE FROM core_restaurant_items
WHERE connection_id NOT IN (SELECT connection_id FROM preserved_connections);
UPDATE core_restaurant_items SET
  mention_count = 0, total_upvotes = 0,
  support_mention_count = 0, support_total_upvotes = 0,
  categories = '{}', food_attributes = '{}', ingredients = '{}',
  last_mentioned_at = NULL;

DELETE FROM core_restaurant_locations
WHERE restaurant_id NOT IN (SELECT entity_id FROM preserved_entities);

-- PRESERVED restaurants' restaurant_attributes arrays reference attribute
-- entities this wipe deletes; the check_restaurant_attributes_exist CHECK
-- re-fires on ANY later update to those rows, failing ingest. (Found in
-- production during the 2026-07-30 execution: 1,654 preserved restaurants
-- carried stale refs; one 53-item batch job went terminal-failed on it and
-- had to be pruned + revived. This step now runs INSIDE the wipe.)
UPDATE core_entities e SET restaurant_attributes = COALESCE(
  (SELECT array_agg(a) FROM unnest(e.restaurant_attributes) a
   WHERE a IN (SELECT entity_id FROM preserved_entities)), '{}')
WHERE e.type = 'restaurant'
  AND e.entity_id IN (SELECT entity_id FROM preserved_entities);

DELETE FROM entity_redirects
WHERE from_entity_id NOT IN (SELECT entity_id FROM preserved_entities)
   OR to_entity_id NOT IN (SELECT entity_id FROM preserved_entities);
DELETE FROM core_entities
WHERE entity_id NOT IN (SELECT entity_id FROM preserved_entities);

DELETE FROM core_public_entity_scores
WHERE subject_id NOT IN (SELECT entity_id FROM preserved_entities)
  AND subject_id NOT IN (SELECT connection_id FROM preserved_connections);

SELECT
  (SELECT count(*) FROM preserved_entities) AS preserved_entities,
  (SELECT count(*) FROM preserved_connections) AS preserved_connections,
  (SELECT count(*) FROM core_entities) AS entities_remaining,
  (SELECT count(*) FROM core_restaurant_items) AS connections_remaining;

COMMIT;
