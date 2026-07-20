-- §22 item 8 SCORE CUT — per-source calibration substrate (§8) + provenance
-- re-key to sources (§5).
--
-- 1. source_document_id on item mentions (§8 build item: provenance
--    unification). Nullable: rows are a full-replace projection; the
--    projection rebuild stamps it, and the one-time backfill
--    (crave-score:backfill-mentions) re-stamps the whole ledger.
-- 2. provenance_source_id on scores (§5: scoring provenance + fame-pin key
--    off SOURCES — anchorPlaceId; engine territory = derived union). The old
--    scoring_market_key column is left in place UNWRITTEN so the running v3
--    binary's raw reads don't break mid-deploy; it dies with the Phase C
--    markets purge.
-- 3. crave_score_calibration_epochs: A_ref / A_floor are PER-LANE constants
--    pinned per scoreVersion epoch (§8 — re-pin only with a version bump).
--    `derivation` is the birth certificate: how the pins were measured.

ALTER TABLE core_restaurant_item_mentions
  ADD COLUMN source_document_id uuid;

ALTER TABLE core_public_entity_scores
  ADD COLUMN provenance_source_id uuid;

CREATE TABLE crave_score_calibration_epochs (
  score_version varchar(64) NOT NULL,
  lane          varchar(16) NOT NULL,
  a_ref         double precision NOT NULL,
  a_floor       double precision NOT NULL,
  derivation    jsonb NOT NULL DEFAULT '{}'::jsonb,
  pinned_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (score_version, lane)
);
