-- Retire legacy quality-score materialization and recency-window fields.
-- DROP COLUMN auto-drops dependent indexes.

ALTER TABLE "core_restaurant_items" DROP COLUMN "food_quality_score";
ALTER TABLE "core_restaurant_items" DROP COLUMN "decayed_mention_score";
ALTER TABLE "core_restaurant_items" DROP COLUMN "decayed_upvote_score";
ALTER TABLE "core_restaurant_items" DROP COLUMN "support_decayed_mention_score";
ALTER TABLE "core_restaurant_items" DROP COLUMN "support_decayed_upvote_score";
ALTER TABLE "core_restaurant_items" DROP COLUMN "decayed_scores_updated_at";
ALTER TABLE "core_restaurant_items" DROP COLUMN "recent_mention_count";
ALTER TABLE "core_restaurant_items" DROP COLUMN "support_recent_mention_count";
ALTER TABLE "core_restaurant_items" DROP COLUMN "activity_level";

ALTER TABLE "core_entities" DROP COLUMN "restaurant_quality_score";

DROP TYPE "activity_level";
