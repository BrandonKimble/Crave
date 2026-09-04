-- ONE PRIMARY LOCATION PER RESTAURANT (red team 2026-09-04, docket drain:
-- 259 restaurants locally carried more than one is_primary = true row; the
-- FK core_entities.primary_location_id never disagreed with the boolean —
-- the extras were the same answer plus false extras, F355). The boolean's
-- single-valued meaning is now a PARTIAL UNIQUE (raw SQL — migrate dev will
-- offer to drop it; refuse; see AUTHORING.md class 1).
-- Repair first: the FK row is the elected primary; where a restaurant has
-- no FK, the newest flagged row wins.
UPDATE core_restaurant_locations l
   SET is_primary = false
  FROM core_entities e
 WHERE e.entity_id = l.restaurant_id
   AND l.is_primary
   AND e.primary_location_id IS NOT NULL
   AND l.location_id <> e.primary_location_id;
WITH ranked AS (
  SELECT l.location_id,
         row_number() OVER (PARTITION BY l.restaurant_id ORDER BY l.updated_at DESC, l.location_id) AS rn
    FROM core_restaurant_locations l
    JOIN core_entities e ON e.entity_id = l.restaurant_id
   WHERE l.is_primary AND e.primary_location_id IS NULL
)
UPDATE core_restaurant_locations l
   SET is_primary = false
  FROM ranked r
 WHERE r.location_id = l.location_id AND r.rn > 1;
CREATE UNIQUE INDEX "uq_place_locations_one_primary"
  ON "core_restaurant_locations" ("restaurant_id")
  WHERE "is_primary";
