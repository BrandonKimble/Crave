DROP INDEX IF EXISTS "idx_entities_google_place_id";
DROP INDEX IF EXISTS "core_entities_google_place_id_key";

ALTER TABLE "core_entities"
  DROP CONSTRAINT IF EXISTS "check_restaurant_specific_fields";

ALTER TABLE "core_entities"
  DROP COLUMN IF EXISTS "google_place_id";

ALTER TABLE "core_entities"
  ADD CONSTRAINT "check_restaurant_specific_fields"
  CHECK (
    (type = 'restaurant')
    OR (
      type <> 'restaurant'
      AND latitude IS NULL
      AND longitude IS NULL
      AND address IS NULL
    )
  );
