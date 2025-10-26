-- Add structured location columns to entities
ALTER TABLE "entities"
  ADD COLUMN IF NOT EXISTS "city" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "region" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "country" VARCHAR(2),
  ADD COLUMN IF NOT EXISTS "postal_code" VARCHAR(32);

-- Create indexes to support filtering
CREATE INDEX IF NOT EXISTS "idx_entities_city" ON "entities" ("city");
CREATE INDEX IF NOT EXISTS "idx_entities_region" ON "entities" ("region");
CREATE INDEX IF NOT EXISTS "idx_entities_country" ON "entities" ("country");
