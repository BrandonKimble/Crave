-- ANCHORED GC (reextract-choreography §3.3): after a shadow activation,
-- garbage-collect entities with NO active-run support anywhere, NO anchor,
-- and NO surviving reference. This is the wipe's preservation law applied
-- as post-activation cleanup instead of pre-extract destruction — the wipe
-- script itself remains only the disaster tool.
--
--   psql $DB -f gc-unsupported-entities.sql            (dry run: counts)
--   psql $DB -v execute=1 -f gc-unsupported-entities.sql
\set ON_ERROR_STOP on
BEGIN;

\ir preserved-anchors.sql

CREATE TEMP TABLE referenced_ids AS
SELECT food_id AS entity_id FROM core_restaurant_items
UNION SELECT restaurant_id FROM core_restaurant_items
UNION SELECT unnest(categories) FROM core_restaurant_items
UNION SELECT unnest(food_attributes) FROM core_restaurant_items
UNION SELECT unnest(ingredients) FROM core_restaurant_items
UNION SELECT unnest(restaurant_attributes) FROM core_entities WHERE restaurant_attributes IS NOT NULL
UNION SELECT unnest(canonical_ingredients) FROM core_entities WHERE canonical_ingredients IS NOT NULL
-- ACTIVE-RUN ONLY (big-one red team #3d): an event from a shadow/
-- superseded run is not "support" — without this filter every entity a
-- rejected candidate prompt minted was permanently GC-immune.
UNION SELECT ev.restaurant_id FROM core_restaurant_entity_events ev
  JOIN collection_source_documents d ON d.document_id = ev.source_document_id
  WHERE d.active_extraction_run_id = ev.extraction_run_id
UNION SELECT ev.entity_id FROM core_restaurant_entity_events ev
  JOIN collection_source_documents d ON d.document_id = ev.source_document_id
  WHERE d.active_extraction_run_id = ev.extraction_run_id
UNION SELECT ev.restaurant_id FROM core_restaurant_events ev
  JOIN collection_source_documents d ON d.document_id = ev.source_document_id
  WHERE d.active_extraction_run_id = ev.extraction_run_id;

CREATE TEMP TABLE doomed AS
SELECT e.entity_id FROM core_entities e
WHERE e.entity_id NOT IN (SELECT entity_id FROM preserved_entities)
  AND e.entity_id NOT IN (SELECT entity_id FROM referenced_ids WHERE entity_id IS NOT NULL);

SELECT count(*) AS gc_candidates FROM doomed;
SELECT type, count(*) FROM core_entities WHERE entity_id IN (SELECT entity_id FROM doomed) GROUP BY type;

\if :{?execute}
  DELETE FROM entity_redirects WHERE to_entity_id IN (SELECT entity_id FROM doomed);
  DELETE FROM core_public_entity_scores WHERE subject_id IN (SELECT entity_id FROM doomed);
  DELETE FROM core_restaurant_locations WHERE restaurant_id IN (SELECT entity_id FROM doomed);
  DELETE FROM derived_entity_sibling_edges WHERE anchor_entity_id IN (SELECT entity_id FROM doomed) OR sibling_entity_id IN (SELECT entity_id FROM doomed);
  DELETE FROM derived_food_category_edges WHERE food_id IN (SELECT entity_id FROM doomed) OR category_id IN (SELECT entity_id FROM doomed);
  DELETE FROM core_entities WHERE entity_id IN (SELECT entity_id FROM doomed);
  COMMIT;
\else
  \echo 'DRY RUN — re-run with -v execute=1 to delete.'
  ROLLBACK;
\endif
