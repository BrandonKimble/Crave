-- R14 re-apply (paired with 20260816153000 rollback): the enum value renames
-- return now that the code sweep ships in the same commit. See
-- 20260816150000 for the full decision record (@map-vs-physical, facet).
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

ALTER TYPE entity_type RENAME VALUE 'restaurant' TO 'place';
ALTER TYPE entity_type RENAME VALUE 'food' TO 'item';
ALTER TYPE entity_type RENAME VALUE 'food_attribute' TO 'item_attribute';
ALTER TYPE entity_type RENAME VALUE 'restaurant_attribute' TO 'place_attribute';
