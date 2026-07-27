-- Phase 4: category items. A category CLAIM ("known for their burgers") becomes
-- a first-class row in core_restaurant_items whose food_id IS the category food
-- entity — honest, scoreable, presentable as a category card. The flag is what
-- lets consumers that must NOT double-count (restaurant vote-total rollups)
-- exclude them, while the dish surfaces they were built for keep them.
ALTER TABLE core_restaurant_items
  ADD COLUMN IF NOT EXISTS is_category_item boolean NOT NULL DEFAULT false;

-- Rollup/dish lanes filter on this; partial index keeps those scans cheap.
CREATE INDEX IF NOT EXISTS idx_restaurant_items_dish_only
  ON core_restaurant_items (restaurant_id)
  WHERE NOT is_category_item;
