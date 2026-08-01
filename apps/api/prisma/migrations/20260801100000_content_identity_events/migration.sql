-- CONTENT IDENTITY for the evidence ledger (async-integrity step 2).
-- One claim per (run, document, restaurant[, entity], evidence_type):
-- the old uniques included mention_key, which hashes a model-assigned
-- temp_id — delivery noise, not identity — so re-parses double-filed
-- claims within a run (6,876 + 508 rows deleted by the 2026-08-01 ledger
-- repair). Defensive dedupe first so the index builds on any environment
-- that never ran the repair runner.

DELETE FROM core_restaurant_entity_events ev
USING core_restaurant_entity_events keeper
WHERE keeper.extraction_run_id = ev.extraction_run_id
  AND keeper.source_document_id = ev.source_document_id
  AND keeper.restaurant_id = ev.restaurant_id
  AND keeper.entity_id = ev.entity_id
  AND keeper.evidence_type = ev.evidence_type
  AND keeper.event_id < ev.event_id;

DELETE FROM core_restaurant_events ev
USING core_restaurant_events keeper
WHERE keeper.extraction_run_id = ev.extraction_run_id
  AND keeper.source_document_id = ev.source_document_id
  AND keeper.restaurant_id = ev.restaurant_id
  AND keeper.evidence_type = ev.evidence_type
  AND keeper.event_id < ev.event_id;

ALTER TABLE core_restaurant_entity_events
  DROP CONSTRAINT IF EXISTS "restaurant_entity_events_run_mention_restaurant_entity_type_key";
DROP INDEX IF EXISTS "restaurant_entity_events_run_mention_restaurant_entity_type_key";
CREATE UNIQUE INDEX "restaurant_entity_events_run_doc_restaurant_entity_type_key"
  ON core_restaurant_entity_events (extraction_run_id, source_document_id, restaurant_id, entity_id, evidence_type);

ALTER TABLE core_restaurant_events
  DROP CONSTRAINT IF EXISTS "restaurant_events_run_mention_restaurant_type_key";
DROP INDEX IF EXISTS "restaurant_events_run_mention_restaurant_type_key";
CREATE UNIQUE INDEX "restaurant_events_run_doc_restaurant_type_key"
  ON core_restaurant_events (extraction_run_id, source_document_id, restaurant_id, evidence_type);

-- Mention rows: one (connection, document, kind) claim. The rebuild now
-- enforces this at build time; the partial index makes it impossible to
-- regress. Ballot/doc-less mentions (source_document_id NULL) are exempt.
DELETE FROM core_restaurant_item_mentions m
USING core_restaurant_item_mentions keeper
WHERE keeper.connection_id = m.connection_id
  AND keeper.source_document_id = m.source_document_id
  AND keeper.kind = m.kind
  AND m.source_document_id IS NOT NULL
  AND keeper.id < m.id;

CREATE UNIQUE INDEX "restaurant_item_mentions_connection_doc_kind_key"
  ON core_restaurant_item_mentions (connection_id, source_document_id, kind)
  WHERE source_document_id IS NOT NULL;

-- Recompute connection counters wherever the mention dedupe changed the
-- underlying rows (counters must mirror mentions exactly — verified 0
-- mismatches on all 17,901 rows before this migration; keep it that way).
UPDATE core_restaurant_items c SET
  mention_count = agg.direct_n,
  total_upvotes = agg.direct_u,
  support_mention_count = agg.support_n,
  support_total_upvotes = agg.support_u
FROM (
  SELECT m.connection_id,
    count(*) FILTER (WHERE m.kind = 'direct')::int AS direct_n,
    COALESCE(sum(m.source_upvotes) FILTER (WHERE m.kind = 'direct'), 0)::int AS direct_u,
    count(*) FILTER (WHERE m.kind = 'support')::int AS support_n,
    COALESCE(sum(m.source_upvotes) FILTER (WHERE m.kind = 'support'), 0)::int AS support_u
  FROM core_restaurant_item_mentions m
  GROUP BY m.connection_id
) agg
WHERE agg.connection_id = c.connection_id
  AND (c.mention_count <> agg.direct_n
    OR c.total_upvotes <> agg.direct_u
    OR c.support_mention_count <> agg.support_n
    OR c.support_total_upvotes <> agg.support_u);
