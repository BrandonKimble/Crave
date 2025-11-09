ALTER TABLE "entities"
  ADD COLUMN IF NOT EXISTS "price_level" SMALLINT,
  ADD COLUMN IF NOT EXISTS "price_level_updated_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "idx_entities_price_level"
  ON "entities" ("price_level");
