DROP INDEX IF EXISTS "idx_entities_name_type_market_key";
DROP INDEX IF EXISTS "idx_entities_market_key_type";
DROP INDEX IF EXISTS "idx_entities_market_key";

ALTER TABLE "core_entities"
  DROP COLUMN IF EXISTS "market_key";
