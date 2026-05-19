-- Demand scoring traces can contain the same subject key in different
-- resolved-entity lanes. Include entity identity in the de-dupe contract so
-- createMany(skipDuplicates) does not silently drop valid candidates.
DROP INDEX IF EXISTS "uq_demand_scoring_candidate_scope";

CREATE UNIQUE INDEX "uq_demand_scoring_candidate_scope"
  ON "demand_scoring_candidates" (
    "run_id",
    "consumer_kind",
    "candidate_kind",
    "subject_kind",
    "subject_key",
    "entity_id",
    "entity_type",
    "market_key",
    "collectable_market_key",
    "bucket",
    "lane",
    "reason"
  ) NULLS NOT DISTINCT;
