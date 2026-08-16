-- COORDINATION ROLLBACK (2026-08-16): 20260816150000 renamed the entity_type
-- enum values while the shared local DB was live for sessions running
-- COMMITTED code (which still casts 'restaurant'::entity_type) — 118 tests
-- went red fleet-wide. This forward migration reverts ONLY the enum value
-- renames until the R14 code sweep is commit-ready; a new migration
-- re-applies them at sweep-commit time. The facet backfill from 150000 is
-- KEPT: the facet column pre-exists and committed code never reads the new
-- stamps, so it breaks nothing.
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

ALTER TYPE entity_type RENAME VALUE 'place' TO 'restaurant';
ALTER TYPE entity_type RENAME VALUE 'item' TO 'food';
ALTER TYPE entity_type RENAME VALUE 'item_attribute' TO 'food_attribute';
ALTER TYPE entity_type RENAME VALUE 'place_attribute' TO 'restaurant_attribute';
