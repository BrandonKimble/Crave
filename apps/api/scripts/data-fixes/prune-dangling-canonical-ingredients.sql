-- Heal dangling canonical_ingredients left by the 2026-07-30 GLOBAL wipe,
-- which deleted ingredient entities without pruning the food entities'
-- canonical_ingredients arrays (166 foods on prod, found 2026-07-31).
-- knowledge_synthesized_at is reset so the offline dish-knowledge pass
-- re-synthesizes these foods — without this the staleness is sticky.
-- The city-scoped wipe (scripts/reload/wipe-city-derived.sql) cannot
-- recreate this state: its REFERENCED-MEANS-ALIVE rule keeps any entity a
-- surviving canonical array points at.
BEGIN;
UPDATE core_entities e SET
  canonical_ingredients = COALESCE(
    (SELECT array_agg(a) FROM unnest(e.canonical_ingredients) a
     WHERE a IN (SELECT entity_id FROM core_entities)), '{}'),
  knowledge_synthesized_at = NULL
WHERE EXISTS (
  SELECT 1 FROM unnest(e.canonical_ingredients) a
  WHERE a NOT IN (SELECT entity_id FROM core_entities));
SELECT count(*) AS still_dangling FROM core_entities e
WHERE EXISTS (
  SELECT 1 FROM unnest(e.canonical_ingredients) a
  WHERE a NOT IN (SELECT entity_id FROM core_entities));
COMMIT;
