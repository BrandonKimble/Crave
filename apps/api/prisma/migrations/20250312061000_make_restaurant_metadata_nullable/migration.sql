ALTER TABLE "entities"
  ALTER COLUMN "restaurant_metadata" DROP DEFAULT;

ALTER TABLE "entities"
  ALTER COLUMN "restaurant_metadata" DROP NOT NULL;

UPDATE "entities"
SET "restaurant_metadata" = NULL
WHERE "restaurant_metadata"::text = '{}'::text;
