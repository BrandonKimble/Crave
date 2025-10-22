-- Drop legacy mentions table that stored per-connection evidence.
DROP TABLE IF EXISTS "mentions";

-- Extend connections with bookkeeping for category boost replays.
ALTER TABLE "connections"
  ADD COLUMN "boost_last_applied_at" TIMESTAMPTZ;

-- Rename restaurant_category_signals to shorter aggregate table name.
ALTER TABLE "restaurant_category_signals" RENAME TO "category_aggregates";

-- Rebuild indexes to match new table name (drops old ones implicitly).
DROP INDEX IF EXISTS "idx_category_signal_category";
DROP INDEX IF EXISTS "idx_category_signal_restaurant";

CREATE INDEX "idx_category_aggregate_category"
  ON "category_aggregates" ("category_id");

CREATE INDEX "idx_category_aggregate_restaurant"
  ON "category_aggregates" ("restaurant_id", "total_upvotes" DESC);

-- Add decayed scores to aggregates for low-latency fallbacks.
ALTER TABLE "category_aggregates"
  ADD COLUMN "decayed_mention_score" NUMERIC(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN "decayed_upvote_score" NUMERIC(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN "decayed_scores_updated_at" TIMESTAMPTZ;

-- Event log for replaying boost math after collection runs.
CREATE TABLE "boosts" (
  "boost_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "food_attribute_ids" UUID[] NOT NULL DEFAULT '{}',
  "mention_created_at" TIMESTAMPTZ NOT NULL,
  "upvotes" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_boosts_restaurant_category_time"
  ON "boosts" ("restaurant_id", "category_id", "mention_created_at");

CREATE INDEX "idx_boosts_category"
  ON "boosts" ("category_id");

CREATE INDEX "idx_boosts_restaurant"
  ON "boosts" ("restaurant_id");

CREATE INDEX "idx_boosts_food_attributes"
  ON "boosts" USING GIN ("food_attribute_ids");
