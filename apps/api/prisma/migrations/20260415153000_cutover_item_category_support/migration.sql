ALTER TABLE "core_restaurant_items"
ADD COLUMN "category_support_mention_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "category_support_total_upvotes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "category_support_recent_mention_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "category_support_decayed_mention_score" DECIMAL(18, 6) NOT NULL DEFAULT 0,
ADD COLUMN "category_support_decayed_upvote_score" DECIMAL(18, 6) NOT NULL DEFAULT 0;

ALTER TABLE "core_restaurant_items"
DROP COLUMN "boost_last_applied_at";

DROP TABLE IF EXISTS "core_boosts" CASCADE;
DROP TABLE IF EXISTS "core_category_aggregates" CASCADE;
