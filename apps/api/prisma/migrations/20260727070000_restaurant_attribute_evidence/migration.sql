-- Phase 4b foundation: restaurant attributes become DERIVABLE.
--
-- Today `core_entities.restaurant_attributes` is a merge-only accumulator
-- written by four paths — it can never shrink, so re-extraction (the whole
-- correction mechanism of this system) cannot fix a wrong attribute.
-- Measured 2026-07-27: 46,740 stamped pairs, of which 36,340 (77.7%) have
-- NO reddit event behind them — they come from Google enrichment and the
-- cuisine-extraction pass. So the fix cannot be "derive it from events":
-- three of the four writers have no source document, no extraction run,
-- and therefore cannot write core_restaurant_entity_events (whose FKs are
-- NOT NULL and load-bearing).
--
-- This table is where every source can state a claim in a shape that is
-- rebuildable: source_class says WHO says so, so a Google current-state
-- fact stays distinguishable from reddit consensus, and each source's
-- contribution can be recomputed independently.
--
-- NO time decay by design: an attribute is a characterization, not praise.
-- A patio does not fade. Correction comes from RECOMPUTATION (rebuild from
-- what the sources currently say), never from a half-life.
CREATE TABLE IF NOT EXISTS core_restaurant_attribute_evidence (
  restaurant_id  uuid        NOT NULL REFERENCES core_entities(entity_id) ON DELETE CASCADE,
  attribute_id   uuid        NOT NULL REFERENCES core_entities(entity_id) ON DELETE CASCADE,
  -- reddit_evidence | places_api | cuisine_llm | poll_seed | entity_merge
  source_class   text        NOT NULL,
  -- Evidence strength within this source class (reddit: mention count;
  -- single-observation sources: 1). Confidence, never recency.
  observations   integer     NOT NULL DEFAULT 1,
  computed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, attribute_id, source_class)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_attribute_evidence_attr
  ON core_restaurant_attribute_evidence (attribute_id);
