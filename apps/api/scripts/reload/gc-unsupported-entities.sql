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
-- ANY SURVIVING EVENT IS SUPPORT (final red team F1 — this REVERSES the
-- big-one's active-run-only filter, which was the wrong shape): a RETAINED
-- generation's events (activate-shadow supersede:'retain') exist precisely
-- so rollback stays a pointer flip, and these ids CASCADE-delete events.
-- An active-run-only GC deleted retained-generation-supported vocabulary
-- and took the rollback evidence with it. The reclamation point for a dead
-- generation is the EXPLICIT `reextract.sh discard`, which deletes that
-- generation's events first — after which these entities lose support and
-- collect here naturally. Run GC after discard, never between an
-- activation and its rollback decision.
UNION SELECT restaurant_id FROM core_restaurant_entity_events
UNION SELECT entity_id FROM core_restaurant_entity_events
UNION SELECT restaurant_id FROM core_restaurant_events;

CREATE TEMP TABLE doomed AS
SELECT e.entity_id FROM core_entities e
WHERE e.entity_id NOT IN (SELECT entity_id FROM preserved_entities)
  AND e.entity_id NOT IN (SELECT entity_id FROM referenced_ids WHERE entity_id IS NOT NULL)
  -- TOMBSTONES ARE MEMORY (final-final red team blocker 1, executed: 91%
  -- of GC's kill list was archived rows — 1,716 junk verdicts whose
  -- deletion re-arms the re-mint churn tombstone-adopt exists to stop,
  -- and 365 merge losers whose deletion silently UNDOES the merge at the
  -- next mention). Archived rows are cheap (~2k) and their entire value
  -- is being remembered; GC only collects unsupported ACTIVE vocabulary.
  AND e.status <> 'archived'
  -- latent silent-nulling seam: demand candidates are ON DELETE SET NULL
  AND e.entity_id NOT IN (SELECT entity_id FROM demand_scoring_candidates WHERE entity_id IS NOT NULL);

SELECT count(*) AS gc_candidates FROM doomed;
SELECT type, count(*) FROM core_entities WHERE entity_id IN (SELECT entity_id FROM doomed) GROUP BY type;

\if :{?execute}
  DELETE FROM entity_redirects WHERE to_entity_id IN (SELECT entity_id FROM doomed)
     OR from_entity_id IN (SELECT entity_id FROM doomed);
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
