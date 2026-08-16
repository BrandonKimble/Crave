-- @script-class: operational (psql; dry-run by default — see below)
--
-- RETRO SHADOW SWEEP (plans/shadow-sandbox.md, docket SD-1/SD-2).
-- Pre-rehearsal shadow replays banked surfaces and minted entities with NO
-- marker (the 1,402-surface incident; witnesses: 'bơ'→junk 'bo' surface
-- 4200d370, entity 'bo'). Their one honest signature: every extraction
-- EVENT that references them belongs to a run that never became any
-- document's active run. This sweep finds and (with :execute=1) archives
-- them. Runs once, at rehearsal-migration landing; the rehearsal status
-- makes the class unmintable afterwards.
--
--   psql $DB -f scripts/reload/retro-shadow-sweep.sql              -- report
--   psql $DB -v execute=1 -f scripts/reload/retro-shadow-sweep.sql -- apply
\set execute :execute
SELECT CASE WHEN :'execute' = ':execute' THEN 0 ELSE 1 END AS executing \gset

-- Runs that never activated for any document.
CREATE TEMP TABLE tmp_dead_runs AS
SELECT r.extraction_run_id
  FROM collection_extraction_runs r
 WHERE NOT EXISTS (
         SELECT 1 FROM collection_source_documents d
          WHERE d.active_extraction_run_id = r.extraction_run_id);

-- SD-1: extraction-sourced surfaces whose OWNING ENTITY has live evidence,
-- but whose form was banked ONLY by dead-run events (form seen in no
-- active-run event for that entity). Conservative: a form any live event
-- mentions survives.
CREATE TEMP TABLE tmp_sd1 AS
SELECT es.surface_id, es.entity_id, es.form
  FROM entity_surface es
 WHERE es.source = 'extraction'
   AND es.status = 'active'
   AND EXISTS (
         SELECT 1 FROM core_restaurant_entity_events ev
           JOIN tmp_dead_runs dr ON dr.extraction_run_id = ev.extraction_run_id
          WHERE ev.entity_id = es.entity_id)
   AND NOT EXISTS (
         SELECT 1 FROM core_restaurant_entity_events ev
           JOIN collection_source_documents d
             ON d.document_id = ev.source_document_id
            AND d.active_extraction_run_id = ev.extraction_run_id
          WHERE ev.entity_id = es.entity_id);

-- SD-2: entities whose EVERY entity-event belongs to a dead run (and that
-- are not place-grounded — the never-delete law).
CREATE TEMP TABLE tmp_sd2 AS
SELECT e.entity_id, e.name, e.type
  FROM core_entities e
 WHERE e.status = 'active'
   AND EXISTS (SELECT 1 FROM core_restaurant_entity_events ev
                WHERE ev.entity_id = e.entity_id)
   AND NOT EXISTS (
         SELECT 1 FROM core_restaurant_entity_events ev
           JOIN collection_source_documents d
             ON d.document_id = ev.source_document_id
            AND d.active_extraction_run_id = ev.extraction_run_id
          WHERE ev.entity_id = e.entity_id)
   AND NOT EXISTS (
         SELECT 1 FROM core_restaurant_locations l
          WHERE l.restaurant_id = e.entity_id
            AND l.google_place_id IS NOT NULL);

SELECT 'SD-1 surfaces (only-dead-run-banked)' AS what, count(*) FROM tmp_sd1
UNION ALL
SELECT 'SD-2 entities (only-dead-run-evidenced, ungrounded)', count(*) FROM tmp_sd2;

SELECT es.form, e.name AS on_entity, e.type
  FROM tmp_sd1 s JOIN entity_surface es ON es.surface_id = s.surface_id
  JOIN core_entities e ON e.entity_id = s.entity_id
 LIMIT 25;
SELECT name, type FROM tmp_sd2 LIMIT 25;

\if :executing
  UPDATE entity_surface es SET status = 'deprecated'
   WHERE es.surface_id IN (SELECT surface_id FROM tmp_sd1);
  UPDATE core_entities e SET status = 'archived', last_updated = now()
   WHERE e.entity_id IN (SELECT entity_id FROM tmp_sd2);
  SELECT 'EXECUTED' AS status;
\else
  SELECT 'DRY RUN — re-run with -v execute=1 to apply' AS status;
\endif
