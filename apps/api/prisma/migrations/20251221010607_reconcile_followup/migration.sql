-- DropIndex
DROP INDEX IF EXISTS "idx_entities_restaurant_attributes";

-- DropIndex
DROP INDEX IF EXISTS "idx_entities_address";

-- CreateIndex
CREATE INDEX "idx_entities_restaurant_attributes" ON "core_entities"("restaurant_attributes");

-- CreateIndex
CREATE INDEX "idx_entities_address" ON "core_entities"("address");
