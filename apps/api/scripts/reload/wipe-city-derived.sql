-- CITY-SCOPED DERIVED-LAYER WIPE (the re-extract pattern, step 1).
--
-- Usage (always rehearse on local first; on prod run via the psql proxy):
--   psql "$DB" -v communities='austinfood' -f wipe-city-derived.sql
--   psql "$DB" -v communities='austinfood,foodnyc' -f wipe-city-derived.sql
--
-- Supersedes wipe-austin-derived.sql (2026-07-30), whose GLOBAL deletes
-- destroyed New York's derived graph as collateral while only Austin was
-- re-extracted — discovered 2026-07-31 when the foodnyc keyword lane
-- "self-healed" 20,563 docs at unbudgeted Places + LLM cost. This script
-- deletes ONLY the target communities' evidence ledgers and the rows that
-- become orphans as a result; every other city's derived layer is
-- untouched by construction.
--
-- LAWS ENCODED HERE:
-- 1. RESTAURANT LAW (owner 2026-07-30, ~$118 lesson): a restaurant
--    grounded to a real Google place id is expensive verified knowledge —
--    it survives every wipe, always.
-- 2. USER-ANCHOR LAW (owner 2026-07-31): any entity a user's data points
--    at — poll targets AND topic arrays, list items, photos, curated
--    lists, on-demand requests, signal acts, poll endorsements (both the
--    restaurant axis and the halves of dish-axis composites) — survives,
--    id intact, so user links can never break. Redirect targets of those
--    ids survive too (the demand readers COALESCE one hop through
--    entity_redirects; deleting the hop silently under-counts demand).
-- 3. REFERENCED-MEANS-ALIVE: an entity referenced by ANY surviving row
--    (connection endpoint or array, restaurant_attributes,
--    canonical_ingredients, any remaining event in any city) is not an
--    orphan and is kept. This retires the whole stale-array bug class:
--    the 2026-07-30 production incident (check_restaurant_attributes_exist
--    firing on preserved restaurants) happened because arrays were left
--    pointing at deleted rows — under this rule the referenced rows are
--    simply not deleted.
--
-- What this deliberately does NOT do: touch raw truth (source documents,
-- extraction runs/inputs, users/polls/lists/signals), zero counters for
-- other cities, or rebuild projections — the re-extract runner's ingest
-- rebuilds affected restaurants (connection counters, entity signals,
-- category edges) from the fresh event ledger.

\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------- scope
CREATE TEMP TABLE target_docs AS
SELECT document_id FROM collection_source_documents
WHERE community = ANY(string_to_array(:'communities', ','));

CREATE TEMP TABLE affected_restaurants AS
SELECT DISTINCT restaurant_id FROM (
  SELECT e.restaurant_id FROM core_restaurant_entity_events e
    JOIN target_docs t ON t.document_id = e.source_document_id
  UNION
  SELECT e.restaurant_id FROM core_restaurant_events e
    JOIN target_docs t ON t.document_id = e.source_document_id
) r;

-- --------------------- user-anchor set (shared with anchor-audit.sql)
\ir preserved-anchors.sql

-- --------------------------------------- city-scoped evidence deletion
DELETE FROM core_restaurant_item_mentions m
USING target_docs t WHERE m.source_document_id = t.document_id;
DELETE FROM core_restaurant_entity_events e
USING target_docs t WHERE e.source_document_id = t.document_id;
DELETE FROM core_restaurant_events e
USING target_docs t WHERE e.source_document_id = t.document_id;

-- reddit-derived attribute evidence for the affected restaurants is
-- rebuilt by re-ingest; owner/places-sourced rows are untouched
DELETE FROM core_restaurant_attribute_evidence
WHERE source_class = 'reddit_evidence'
  AND restaurant_id IN (SELECT restaurant_id FROM affected_restaurants);

-- per-restaurant projections the ingest rebuild fully re-derives
DELETE FROM core_restaurant_entity_signals
WHERE restaurant_id IN (SELECT restaurant_id FROM affected_restaurants);

-- connections that lost their last mention and are not user-anchored
DELETE FROM core_restaurant_items c
WHERE c.connection_id NOT IN (SELECT connection_id FROM preserved_connections)
  AND c.restaurant_id IN (SELECT restaurant_id FROM affected_restaurants)
  AND NOT EXISTS (
    SELECT 1 FROM core_restaurant_item_mentions m
    WHERE m.connection_id = c.connection_id
  );

-- surviving affected connections: zero the derived stats and arrays so
-- nothing stale shows between wipe and re-ingest (rebuild re-derives them;
-- empty arrays also keep the connection CHECK constraints trivially true)
UPDATE core_restaurant_items SET
  mention_count = 0, total_upvotes = 0,
  support_mention_count = 0, support_total_upvotes = 0,
  categories = '{}', food_attributes = '{}', ingredients = '{}',
  last_mentioned_at = NULL
WHERE restaurant_id IN (SELECT restaurant_id FROM affected_restaurants);

-- ------------------------------------------------- orphan entity sweep
-- REFERENCED-MEANS-ALIVE: collect every entity id any surviving row still
-- points at; an unpreserved entity is deleted only when nothing references
-- it anywhere (evidence in other cities counts as a reference).
CREATE TEMP TABLE referenced_ids AS
SELECT DISTINCT entity_id FROM (
  SELECT food_id AS entity_id FROM core_restaurant_items
  UNION SELECT restaurant_id FROM core_restaurant_items
  UNION SELECT unnest(categories) FROM core_restaurant_items
  UNION SELECT unnest(food_attributes) FROM core_restaurant_items
  UNION SELECT unnest(ingredients) FROM core_restaurant_items
  UNION SELECT unnest(restaurant_attributes) FROM core_entities
  UNION SELECT unnest(canonical_ingredients) FROM core_entities
  UNION SELECT restaurant_id FROM core_restaurant_entity_events
  UNION SELECT entity_id FROM core_restaurant_entity_events
  UNION SELECT restaurant_id FROM core_restaurant_events
) r;

CREATE TEMP TABLE doomed_entities AS
SELECT entity_id FROM core_entities
WHERE entity_id NOT IN (SELECT entity_id FROM preserved_entities)
  AND entity_id NOT IN (SELECT entity_id FROM referenced_ids);

-- redirects whose TARGET dies are garbage; every other redirect is kept
-- (identity history the demand readers depend on — the from side has no
-- FK and may legitimately point at an already-deleted loser)
DELETE FROM entity_redirects
WHERE to_entity_id IN (SELECT entity_id FROM doomed_entities);

DELETE FROM core_public_entity_scores
WHERE subject_id IN (SELECT entity_id FROM doomed_entities);

DELETE FROM core_restaurant_locations
WHERE restaurant_id IN (SELECT entity_id FROM doomed_entities);

-- stale sibling edges vanish with their endpoints (no FK by design)
DELETE FROM derived_entity_sibling_edges
WHERE anchor_entity_id IN (SELECT entity_id FROM doomed_entities)
   OR sibling_entity_id IN (SELECT entity_id FROM doomed_entities);
DELETE FROM derived_food_category_edges
WHERE food_id IN (SELECT entity_id FROM doomed_entities)
   OR category_id IN (SELECT entity_id FROM doomed_entities);

DELETE FROM core_entities
WHERE entity_id IN (SELECT entity_id FROM doomed_entities);

-- ------------------------------------------- re-assert vocabulary facts
-- Curated facts written ON derived rows do not survive a wipe (learned
-- 2026-08-01: the dietary migration's flags were wiped with the entities
-- on 07-30 and re-extraction minted fresh UNFLAGGED rows — search's
-- never-relax guarantee silently vanished). The dietary set is a closed
-- owner-ratified vocabulary, so re-assert it by name after every wipe;
-- re-extraction resolves onto these rows or the next wipe re-flags again.
UPDATE core_entities SET constraint_class = 'dietary'
WHERE status = 'active'
  AND type IN ('food_attribute', 'restaurant_attribute')
  AND lower(name) IN
    ('vegan','vegetarian','gluten free','gluten-free','halal','kosher','pescatarian');

-- ---------------------------------------------------------------- audit
SELECT
  (SELECT count(*) FROM target_docs)            AS target_docs,
  (SELECT count(*) FROM affected_restaurants)   AS affected_restaurants,
  (SELECT count(*) FROM preserved_entities)     AS preserved_entities,
  (SELECT count(*) FROM preserved_connections)  AS preserved_connections,
  (SELECT count(*) FROM doomed_entities)        AS entities_deleted,
  (SELECT count(*) FROM core_entities)          AS entities_remaining,
  (SELECT count(*) FROM core_restaurant_items)  AS connections_remaining;

-- ------------------------------------------------- rehearse, then commit
-- DRY RUN PARITY WITH THE GC SCRIPT (audit 2026-08-02, F417). This file
-- used to end in a bare COMMIT, so the only way to rehearse the most
-- destructive script in the choreography was to hand-edit a COPY of it and
-- run that — i.e. to rehearse a file that is not the file you then run.
-- (This audit had to do exactly that to verify the script.) The audit
-- SELECT above is computed either way, so a dry run reports the SAME row
-- counts the real run will produce, and then throws the work away.
--
-- Default is COMMIT, deliberately: `-v dryrun=1` is the OPT-IN rehearsal,
-- which keeps every existing invocation of this file meaning what it meant.
-- (gc-unsupported-entities.sql is the mirror image — it opts IN to
-- destruction with `-v execute=1` — because it is a routine sweep, whereas
-- this one is the disaster tool an operator only reaches for deliberately.)
\if :{?dryrun}
  \echo 'DRY RUN — nothing written. Re-run WITHOUT -v dryrun=1 to wipe.'
  ROLLBACK;
\else
  COMMIT;
\endif
