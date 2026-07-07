ALTER TYPE "entity_type" ADD VALUE IF NOT EXISTS 'ingredient';
ALTER TABLE "core_entities" ADD COLUMN "canonical_ingredients" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE "core_restaurant_items" ADD COLUMN "ingredients" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
CREATE INDEX "idx_connections_ingredients_gin" ON "core_restaurant_items" USING GIN ("ingredients");
CREATE INDEX "idx_entities_canonical_ingredients_gin" ON "core_entities" USING GIN ("canonical_ingredients");
