ALTER TABLE "core_entities"
  RENAME COLUMN "location_key" TO "market_key";

ALTER INDEX IF EXISTS "idx_entities_location_key"
  RENAME TO "idx_entities_market_key";

ALTER INDEX IF EXISTS "idx_core_entities_location_key_type"
  RENAME TO "idx_entities_market_key_type";

ALTER INDEX IF EXISTS "idx_entities_location_key_type"
  RENAME TO "idx_entities_market_key_type";

DROP INDEX IF EXISTS "core_entities_name_type_location_key_key";

CREATE INDEX "idx_entities_name_type_market_key"
  ON "core_entities"("name", "type", "market_key");
