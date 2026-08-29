-- SHADOW DIFF (reextract-choreography §4): compare the ACTIVE extraction
-- graph vs a candidate prompt's SHADOW runs for the target communities.
-- Read-only. Run AFTER the shadow replay's batches drain, BEFORE activation.
--
--   psql $DB -v communities='austinfood' -v prompt_hash='<sha256 of candidate>' \
--        -f shadow-diff.sql
--
-- Output sections feed the review file the agent triages (see the
-- reextract skill): LOST-SUPPORT rows need owner decisions when anchored;
-- NEW entities are informational; semantic twins come from anchor-audit.sql.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE target_docs AS
-- active_extraction_run_id scopes "active evidence" to the run each doc
-- actually points at — without it, OTHER shadow versions' events count as
-- active support and mask real regressions (big-one red team, gap 4b).
SELECT document_id, source_id, active_extraction_run_id
FROM collection_source_documents
WHERE community = ANY(string_to_array(:'communities', ','));

-- COMMUNITY-SCOPED (final red team D12): unscoped, an entity the candidate
-- stopped supporting in THIS community but still supports elsewhere looked
-- supported — silently suppressing an OWNER-DECISION row in a rolling or
-- global campaign. Mirrors ExtractionScopeService.shadowRunsFor().
CREATE TEMP TABLE shadow_runs AS
SELECT DISTINCT r.extraction_run_id
FROM collection_extraction_runs r
JOIN collection_extraction_inputs ei ON ei.extraction_run_id = r.extraction_run_id
JOIN collection_extraction_input_documents eid ON eid.input_id = ei.input_id
JOIN target_docs td ON td.document_id = eid.document_id
WHERE r.system_prompt_hash = :'prompt_hash' AND r.status = 'completed';

\ir preserved-anchors.sql

\echo ''
\echo '=== SHADOW COVERAGE (docs with a completed shadow extraction) ==='
SELECT
  count(DISTINCT d.document_id) AS docs_total,
  count(DISTINCT eid.document_id) AS docs_shadowed
FROM target_docs d
LEFT JOIN collection_extraction_input_documents eid
  ON eid.document_id = d.document_id
 AND EXISTS (
   SELECT 1 FROM collection_extraction_inputs ei
   JOIN shadow_runs sr ON sr.extraction_run_id = ei.extraction_run_id
   WHERE ei.input_id = eid.input_id AND ei.raw_output IS NOT NULL);

-- RESOLVE-SHIFT RE-PAIRING (v17 loop3 bench: 50% of "lost support" rows were
-- the SAME establishment landing on a NEW entity id — resolver drift, not
-- lost knowledge). Before a lost entity is listed for owner decision, try to
-- pair it with a shadow entity that shares (type, identity_key) OR an exact
-- canonical-name match with at least one overlapping evidence document.
-- Matched pairs move to the RESOLVE-SHIFT section; LOST SUPPORT reads real
-- losses only.
CREATE TEMP TABLE active_entity_docs AS
SELECT x.entity_id, x.document_id
FROM (
  SELECT ev.entity_id, ev.source_document_id AS document_id
  FROM core_restaurant_entity_events ev
  JOIN target_docs d ON d.document_id = ev.source_document_id
   AND d.active_extraction_run_id = ev.extraction_run_id
  UNION
  SELECT ev.restaurant_id, ev.source_document_id
  FROM core_restaurant_entity_events ev
  JOIN target_docs d ON d.document_id = ev.source_document_id
   AND d.active_extraction_run_id = ev.extraction_run_id
) x;

CREATE TEMP TABLE shadow_entity_docs AS
SELECT x.entity_id, x.document_id
FROM (
  SELECT ev.entity_id, ev.source_document_id AS document_id
  FROM core_restaurant_entity_events ev
  JOIN shadow_runs sr ON sr.extraction_run_id = ev.extraction_run_id
  UNION
  SELECT ev.restaurant_id, ev.source_document_id
  FROM core_restaurant_entity_events ev
  JOIN shadow_runs sr ON sr.extraction_run_id = ev.extraction_run_id
) x;

CREATE TEMP TABLE lost_entities AS
SELECT DISTINCT a.entity_id
FROM active_entity_docs a
WHERE a.entity_id NOT IN (SELECT entity_id FROM shadow_entity_docs);

-- FUZZY NAME FOLD (v17 mechanical): the exact-lowercase name match missed
-- resolver drift that only changed punctuation/spacing or trimmed suffix
-- tokens ("Rudys" vs "Rudy's Bar & Grill", "H Mart" vs "Hmart",
-- "Stein's Deli" vs "Stein's Market and Deli"). fold = lowercase, strip
-- apostrophes entirely (rudy's -> rudys), every other non-alphanumeric run
-- becomes one space. Names then also pair when their space-squashed folds
-- are equal (H Mart/Hmart) or one side's brand tokens are a subset of the
-- other's (Rudys <= rudys bar grill). Fuzzy pairs still REQUIRE >=1 shared
-- evidence document — a similarly-named stranger never swallows a real loss.
CREATE FUNCTION pg_temp.fold_name(text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT btrim(regexp_replace(
           regexp_replace(
             regexp_replace(lower($1), '[''’‘ʼ]', '', 'g'),
             '[^a-z0-9]+', ' ', 'g'),
           '\s+', ' ', 'g'))
$fn$;

CREATE TEMP TABLE lost_cand AS
SELECT e.entity_id, e.name, e.type, e.identity_key,
       pg_temp.fold_name(e.name) AS folded
FROM lost_entities le
JOIN core_entities e ON e.entity_id = le.entity_id AND e.status = 'active';

CREATE TEMP TABLE shadow_cand AS
SELECT e.entity_id, e.name, e.type, e.identity_key,
       pg_temp.fold_name(e.name) AS folded
FROM core_entities e
WHERE EXISTS (SELECT 1 FROM shadow_entity_docs sd
              WHERE sd.entity_id = e.entity_id);

CREATE TEMP TABLE resolve_shifts AS
SELECT DISTINCT ON (pairs.old_entity_id)
  pairs.old_entity_id,
  pairs.new_entity_id,
  pairs.name,
  pairs.type,
  pairs.doc_overlap
FROM (
  SELECT
    olde.entity_id AS old_entity_id,
    newe.entity_id AS new_entity_id,
    olde.name,
    olde.type,
    (NULLIF(olde.identity_key, '') IS NOT NULL
     AND newe.identity_key = olde.identity_key) AS identity_match,
    (SELECT count(DISTINCT ad.document_id)
     FROM active_entity_docs ad
     JOIN shadow_entity_docs sd ON sd.document_id = ad.document_id
      AND sd.entity_id = newe.entity_id
     WHERE ad.entity_id = olde.entity_id) AS doc_overlap
  FROM lost_cand olde
  JOIN shadow_cand newe
    ON newe.entity_id <> olde.entity_id
   AND newe.type = olde.type
   AND (
     (NULLIF(olde.identity_key, '') IS NOT NULL
      AND newe.identity_key = olde.identity_key)
     OR lower(newe.name) = lower(olde.name)
     -- punctuation/apostrophe/space fold: "glorias" = "gloria's",
     -- "hmart" = "h mart"
     OR (olde.folded <> '' AND newe.folded <> ''
         AND replace(newe.folded, ' ', '') = replace(olde.folded, ' ', ''))
     -- brand-token containment: one folded name's tokens are a subset of
     -- the other's ("rudys" in "rudys bar grill"; "steins deli" in
     -- "steins market and deli")
     OR (olde.folded <> '' AND newe.folded <> ''
         AND (string_to_array(newe.folded, ' ') <@ string_to_array(olde.folded, ' ')
              OR string_to_array(olde.folded, ' ') <@ string_to_array(newe.folded, ' ')))
   )
) pairs
-- an identity_key match pairs on its own; a bare name match must also share
-- at least one evidence document, or a same-name stranger would swallow a
-- real loss.
WHERE pairs.identity_match OR pairs.doc_overlap > 0
ORDER BY pairs.old_entity_id, pairs.doc_overlap DESC, pairs.new_entity_id;

\echo ''
\echo '=== RESOLVE-SHIFT (same identity/name re-landed on a new shadow entity) ==='
\echo '--- bookkeeping, not lost knowledge: re-run resolution, no owner decision'
SELECT old_entity_id, new_entity_id, name, type, doc_overlap
FROM resolve_shifts
ORDER BY type, name
LIMIT 500;

\echo ''
\echo '=== LOST SUPPORT (active evidence, zero shadow evidence, no re-pair) ==='
\echo '--- anchored=t rows are OWNER-DECISION; anchored=f are informational'
SELECT
  e.entity_id,
  e.name,
  e.type,
  (p.entity_id IS NOT NULL) AS anchored
FROM lost_entities a
JOIN core_entities e ON e.entity_id = a.entity_id AND e.status = 'active'
LEFT JOIN preserved_entities p ON p.entity_id = e.entity_id
WHERE a.entity_id NOT IN (SELECT old_entity_id FROM resolve_shifts)
ORDER BY anchored DESC, e.type, e.name
LIMIT 500;

\echo ''
\echo '=== NEW UNDER SHADOW (entities only the candidate prompt produced) ==='
-- ONE ROW PER IDENTITY (junk RC7): the rehearsal sandbox hides shadow runs
-- from each other, so a doc completed in two shadow runs used to mint
-- identical-identity_key rehearsal twins and this section counted them as
-- two "new entities". The double-extraction itself is now refused at the
-- replay chokepoint (replay.service.ts); this dedupe keeps the report
-- honest about any residue — identity_rows > 1 flags a cross-run twin.
SELECT
  (min(e.entity_id::text))::uuid AS entity_id,
  min(e.name) AS name,
  e.type,
  count(DISTINCT e.entity_id) AS identity_rows
FROM core_restaurant_entity_events ev
JOIN shadow_runs sr ON sr.extraction_run_id = ev.extraction_run_id
JOIN core_entities e ON e.entity_id = ev.entity_id
WHERE NOT EXISTS (
  SELECT 1 FROM core_restaurant_entity_events old
  JOIN target_docs d ON d.document_id = old.source_document_id
  WHERE old.entity_id = ev.entity_id
    AND old.extraction_run_id NOT IN (SELECT extraction_run_id FROM shadow_runs)
)
GROUP BY e.type, COALESCE(NULLIF(e.identity_key, ''), e.entity_id::text)
ORDER BY e.type, min(e.name)
LIMIT 500;

\echo ''
\echo '=== CONTRACT REFUSALS (banked observed-span refusals, per reason) ==='
\echo '--- a refusal rate that surprises you is an OWNER-DECISION, not a log line'
SELECT
  r.reason,
  count(*) AS refusals,
  count(DISTINCT r.extraction_run_id) AS runs,
  count(DISTINCT r.source_document_id) AS docs
FROM collection_extraction_contract_refusals r
JOIN shadow_runs sr ON sr.extraction_run_id = r.extraction_run_id
GROUP BY r.reason
ORDER BY refusals DESC;

\echo ''
\echo '=== CONTRACT REFUSAL SAMPLES (up to 50, newest first) ==='
SELECT
  r.reason,
  r.mention->>'place_observed' AS place_observed,
  r.mention->>'place_source_id' AS place_source_id,
  r.mention->>'source_id' AS source_id,
  left(coalesce(r.detail, ''), 120) AS detail
FROM collection_extraction_contract_refusals r
JOIN shadow_runs sr ON sr.extraction_run_id = r.extraction_run_id
ORDER BY r.created_at DESC
LIMIT 50;

ROLLBACK;
