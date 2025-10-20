-- Remove legacy menu-item flag; connections are implicitly menu-item edges
ALTER TABLE "connections"
  DROP COLUMN IF EXISTS "is_menu_item";

-- Track category-only mentions per restaurant for future scoring
CREATE TABLE IF NOT EXISTS "restaurant_category_signals" (
  "restaurant_id" UUID NOT NULL REFERENCES "entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE,
  "category_id" UUID NOT NULL REFERENCES "entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE,
  "mentions_count" INTEGER DEFAULT 0,
  "total_upvotes" INTEGER DEFAULT 0,
  "first_mentioned_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "last_mentioned_at" TIMESTAMP,
  CONSTRAINT "restaurant_category_signals_pkey" PRIMARY KEY ("restaurant_id", "category_id")
);

CREATE INDEX IF NOT EXISTS "idx_category_signal_category"
  ON "restaurant_category_signals"("category_id");

CREATE INDEX IF NOT EXISTS "idx_category_signal_restaurant"
  ON "restaurant_category_signals"("restaurant_id", "total_upvotes" DESC);

