-- Keyword collection now owns priority decisions directly from durable demand
-- facts and score traces. The old entity priority metrics table was a stale
-- intermediate owner and is intentionally removed.
DROP TABLE IF EXISTS "collection_entity_priority_metrics";
