-- redteam-l2 K4 (narrow slice) + K5 sweep (2026-08-26).
--
-- K4: the dish NAME is an input to knowledge synthesis ("al pastor taco" ->
-- pork...), but the done-stamp recorded only the rule version — a renamed
-- dish was never re-synthesized. Stamp the name the synthesis answered for;
-- the due-predicate treats a differing name as owed work.
--
-- Corpus-wide UPDATEs below: parallel workers off (AUTHORING.md rule 1 —
-- prod's small /dev/shm kills parallel plans mid-migration).
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

ALTER TABLE core_entities ADD COLUMN knowledge_synthesized_name text;

-- Backfill: rows already synthesized answered for their CURRENT name (no
-- rename ledger exists to say otherwise); only future renames re-open work.
UPDATE core_entities
SET knowledge_synthesized_name = name
WHERE knowledge_synthesized_at IS NOT NULL;

-- K5 repair: the venue-facts cuisine lane minted place_attribute rows with
-- NO facet (and implicit active status) between S4 (2026-08-26) and this
-- fix — cuisines invisible to the cuisine registry, the grain bridge, and
-- placement. The lane's surface writer tags every form source='cuisine',
-- which identifies its mints; stamp the facet they were always meant to
-- carry.
UPDATE core_entities e
SET facet = 'cuisine'
WHERE e.type = 'place_attribute'
  AND e.facet IS NULL
  AND EXISTS (
    SELECT 1 FROM entity_surface s
    WHERE s.entity_id = e.entity_id
      AND s.source = 'cuisine'
  );
