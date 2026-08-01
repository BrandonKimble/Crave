-- CLASS ⑤ (data audit 2026-08): category-edge hygiene + pipeline hygiene.

-- 1. symmetric pairs: the lower-support direction is the wrong one
--    (12 of 14 resolved mechanically by support ratio; ties drop both
--    directions of the pair — synonym shapes belong in aliasing, not the
--    taxonomy).
DELETE FROM derived_food_category_edges e
USING derived_food_category_edges rev
WHERE rev.food_id = e.category_id AND rev.category_id = e.food_id
  AND (e.conn_support < rev.conn_support
       OR (e.conn_support = rev.conn_support AND e.food_id < e.category_id));

-- 2. containment inversions: the category NAME strictly contains the food
--    name → the parent is more specific than the child, backwards.
DELETE FROM derived_food_category_edges e
USING core_entities f, core_entities c
WHERE f.entity_id = e.food_id AND c.entity_id = e.category_id
  AND position(lower(f.name) IN lower(c.name)) > 0
  AND lower(f.name) <> lower(c.name)
  AND e.conn_support <= 5;

-- 3. single-support taxonomy tail: one connection anywhere minted a
--    permanent edge (81% of the table). Keep an edge when it has >= 2
--    supporting connections OR it is the food's ONLY category signal
--    (a single-connection food's whole taxonomy would vanish otherwise —
--    same rule the rebuild now applies at mint time).
DELETE FROM derived_food_category_edges e
WHERE e.conn_support < 2
  AND e.conn_support < e.food_conns;

-- 4. the shadow rule's admission flag: parents with dish-level children
--    at the same restaurant must be category items or the one-claim-once
--    rule never considers them.
UPDATE core_restaurant_items parent SET is_category_item = true
WHERE parent.is_category_item = false
  AND EXISTS (
    SELECT 1 FROM core_restaurant_items child
    JOIN derived_food_category_edges e
      ON e.food_id = child.food_id AND e.category_id = parent.food_id
    WHERE child.restaurant_id = parent.restaurant_id
      AND child.connection_id <> parent.connection_id
  );

-- 5. phantom connections: mentions but zero backing events, not
--    user-anchored, not curated
DELETE FROM core_restaurant_items c
WHERE c.mention_count > 0
  AND NOT EXISTS (
    SELECT 1 FROM core_restaurant_entity_events ev
    WHERE ev.restaurant_id = c.restaurant_id AND ev.entity_id = c.food_id
  )
  AND NOT EXISTS (SELECT 1 FROM user_list_items u WHERE u.connection_id = c.connection_id)
  AND NOT EXISTS (SELECT 1 FROM photos p WHERE p.connection_id = c.connection_id)
  AND NOT EXISTS (SELECT 1 FROM curated_list_items cl WHERE cl.connection_id = c.connection_id);

-- 6. pipeline hygiene: docs stranded on the failed 2026-07-06 foodnyc run
--    become visibly unextracted (NULL pointer = the coverage machinery
--    re-collects them); dead region-us-* scaffolding communities go.
UPDATE collection_source_documents d
SET active_extraction_run_id = NULL
FROM collection_extraction_runs r
WHERE r.extraction_run_id = d.active_extraction_run_id
  AND r.status = 'failed';
DELETE FROM collection_source_documents WHERE community LIKE 'region-us-%';

SELECT
  (SELECT count(*) FROM derived_food_category_edges) AS edges_after,
  (SELECT count(*) FROM derived_food_category_edges e
    JOIN derived_food_category_edges rev
      ON rev.food_id = e.category_id AND rev.category_id = e.food_id) AS symmetric_after;
