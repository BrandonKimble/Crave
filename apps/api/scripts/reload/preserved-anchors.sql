-- THE canonical user-anchor set (single source of truth — included via \ir
-- by wipe-city-derived.sql and anchor-audit.sql so the wipe's preservation
-- and the post-run audit can never drift apart).
--
-- Creates TEMP tables:
--   preserved_connections(connection_id) — connections user data points at
--   preserved_entities(entity_id)        — entities user data points at,
--     plus one redirect hop (acts recorded under a merge loser resolve to
--     its winner at read), plus every place-grounded restaurant
--     (RESTAURANT LAW, owner 2026-07-30, ~$118 lesson).

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
  UNION SELECT unnest(category_entity_ids) FROM poll_topics
  UNION SELECT unnest(seed_entity_ids) FROM poll_topics
  UNION SELECT restaurant_id FROM user_list_items WHERE restaurant_id IS NOT NULL
  UNION SELECT restaurant_id FROM photos WHERE restaurant_id IS NOT NULL
  UNION SELECT entity_id FROM curated_list_items WHERE entity_id IS NOT NULL
  UNION SELECT restaurant_id FROM curated_list_items WHERE restaurant_id IS NOT NULL
  UNION SELECT entity_id FROM collection_on_demand_requests WHERE entity_id IS NOT NULL
  -- signal acts (searches, views, favorites, poll votes) are user data
  UNION SELECT subject_id FROM signals
    WHERE subject_type = 'entity' AND subject_id IS NOT NULL
  -- poll endorsements: restaurant axis is a bare uuid; dish axis is a
  -- poll-local 'restaurantId::foodId' composite — preserve both halves
  UNION SELECT subject_id::uuid FROM poll_endorsements
    WHERE subject_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  UNION SELECT split_part(subject_id, '::', 1)::uuid FROM poll_endorsements
    WHERE subject_id ~ '^[0-9a-f-]{36}::[0-9a-f-]{36}$'
  UNION SELECT split_part(subject_id, '::', 2)::uuid FROM poll_endorsements
    WHERE subject_id ~ '^[0-9a-f-]{36}::[0-9a-f-]{36}$'
  UNION SELECT ci.food_id FROM core_restaurant_items ci
    JOIN preserved_connections pc ON pc.connection_id = ci.connection_id
  UNION SELECT ci.restaurant_id FROM core_restaurant_items ci
    JOIN preserved_connections pc ON pc.connection_id = ci.connection_id
  -- RESTAURANT LAW
  UNION SELECT rl.restaurant_id FROM core_restaurant_locations rl
    WHERE rl.google_place_id IS NOT NULL
) e WHERE entity_id IS NOT NULL;

-- TRANSITIVE redirect closure (red team 2026-08-01 R7: merges flatten
-- chains, but a wipe must not depend on that invariant holding — walk the
-- whole chain so every hop's target survives).
INSERT INTO preserved_entities
WITH RECURSIVE hops AS (
  SELECT r.to_entity_id FROM entity_redirects r
  JOIN preserved_entities p ON p.entity_id = r.from_entity_id
  UNION
  SELECT r.to_entity_id FROM entity_redirects r
  JOIN hops h ON h.to_entity_id = r.from_entity_id
)
SELECT DISTINCT to_entity_id FROM hops
WHERE to_entity_id NOT IN (SELECT entity_id FROM preserved_entities);
-- NOTE (audited 2026-08-01): live signals.subject_type values are exactly
-- {'none','entity'} — the entity filter above covers every subject-bearing
-- signal. If a new subject_type is ever introduced, add its id translation
-- here (the poll_endorsements composite handling is the template).
