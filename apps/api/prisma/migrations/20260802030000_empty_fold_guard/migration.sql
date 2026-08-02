-- FINAL-FINAL RED TEAM HIGH-1: every non-Latin name (CJK, Cyrillic,
-- emoji) folds to '' — the partial unique then made the FIRST such
-- attribute the sink for ALL of them ('食べ放題' blocked 'Шведский стол'
-- with a duplicate-key error; executed). An empty fold is NO identity:
-- the index simply doesn't apply, and the app probes skip it too.
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;
DROP INDEX IF EXISTS uq_attribute_identity_key;
CREATE UNIQUE INDEX uq_attribute_identity_key
  ON core_entities (type, identity_key)
  WHERE status <> 'archived'
    AND type IN ('food_attribute', 'restaurant_attribute')
    AND identity_key <> '';
