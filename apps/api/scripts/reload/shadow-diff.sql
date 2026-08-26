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

\echo ''
\echo '=== LOST SUPPORT (active evidence, zero shadow evidence) ==='
\echo '--- anchored=t rows are OWNER-DECISION; anchored=f are informational'
WITH active_entities AS (
  SELECT DISTINCT ev.entity_id
  FROM core_restaurant_entity_events ev
  JOIN target_docs d ON d.document_id = ev.source_document_id
   AND d.active_extraction_run_id = ev.extraction_run_id
  UNION
  SELECT DISTINCT ev.restaurant_id
  FROM core_restaurant_entity_events ev
  JOIN target_docs d ON d.document_id = ev.source_document_id
   AND d.active_extraction_run_id = ev.extraction_run_id
),
shadow_entities AS (
  SELECT DISTINCT ev.entity_id
  FROM core_restaurant_entity_events ev
  JOIN shadow_runs sr ON sr.extraction_run_id = ev.extraction_run_id
  UNION
  SELECT DISTINCT ev.restaurant_id
  FROM core_restaurant_entity_events ev
  JOIN shadow_runs sr ON sr.extraction_run_id = ev.extraction_run_id
)
SELECT
  e.entity_id,
  e.name,
  e.type,
  (p.entity_id IS NOT NULL) AS anchored
FROM active_entities a
JOIN core_entities e ON e.entity_id = a.entity_id AND e.status = 'active'
LEFT JOIN preserved_entities p ON p.entity_id = e.entity_id
WHERE a.entity_id NOT IN (SELECT entity_id FROM shadow_entities)
ORDER BY anchored DESC, e.type, e.name
LIMIT 500;

\echo ''
\echo '=== NEW UNDER SHADOW (entities only the candidate prompt produced) ==='
SELECT DISTINCT e.entity_id, e.name, e.type
FROM core_restaurant_entity_events ev
JOIN shadow_runs sr ON sr.extraction_run_id = ev.extraction_run_id
JOIN core_entities e ON e.entity_id = ev.entity_id
WHERE NOT EXISTS (
  SELECT 1 FROM core_restaurant_entity_events old
  JOIN target_docs d ON d.document_id = old.source_document_id
  WHERE old.entity_id = ev.entity_id
    AND old.extraction_run_id NOT IN (SELECT extraction_run_id FROM shadow_runs)
)
ORDER BY e.type, e.name
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
