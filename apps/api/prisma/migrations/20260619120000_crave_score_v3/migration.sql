-- Crave Score v3 (endorsement redesign): drop the v2 robust-z/confidence-shrink columns,
-- rename raw_quality_score -> endorsement_raw, add percentile_rank, drop the unused market-stats table.

-- core_public_entity_scores
ALTER TABLE "core_public_entity_scores" DROP COLUMN "global_z";
ALTER TABLE "core_public_entity_scores" DROP COLUMN "market_z";
ALTER TABLE "core_public_entity_scores" DROP COLUMN "market_reliability";
ALTER TABLE "core_public_entity_scores" DROP COLUMN "entity_confidence";
ALTER TABLE "core_public_entity_scores" DROP COLUMN "normalized_signal";
ALTER TABLE "core_public_entity_scores" DROP COLUMN "posterior_signal";
ALTER TABLE "core_public_entity_scores" RENAME COLUMN "raw_quality_score" TO "endorsement_raw";
ALTER TABLE "core_public_entity_scores" ADD COLUMN "percentile_rank" DECIMAL(6,5) NOT NULL DEFAULT 0;
ALTER TABLE "core_public_entity_scores" ALTER COLUMN "percentile_rank" DROP DEFAULT;

-- core_public_entity_score_history
ALTER TABLE "core_public_entity_score_history" DROP COLUMN "normalized_signal";
ALTER TABLE "core_public_entity_score_history" DROP COLUMN "posterior_signal";
ALTER TABLE "core_public_entity_score_history" DROP COLUMN "entity_confidence";
ALTER TABLE "core_public_entity_score_history" DROP COLUMN "market_reliability";
ALTER TABLE "core_public_entity_score_history" ADD COLUMN "endorsement_raw" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "core_public_entity_score_history" ALTER COLUMN "endorsement_raw" DROP DEFAULT;
ALTER TABLE "core_public_entity_score_history" ADD COLUMN "percentile_rank" DECIMAL(6,5) NOT NULL DEFAULT 0;
ALTER TABLE "core_public_entity_score_history" ALTER COLUMN "percentile_rank" DROP DEFAULT;

-- unused market-stats table (v3 has no market-relative math; no external consumers)
DROP TABLE "core_crave_score_market_stats";
