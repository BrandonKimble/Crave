-- AlterTable
ALTER TABLE "core_restaurant_locations"
DROP COLUMN "price_level",
DROP COLUMN "price_level_updated_at",
DROP COLUMN "metadata",
ADD COLUMN "phone_number" VARCHAR(64),
ADD COLUMN "website_url" VARCHAR(2048),
ADD COLUMN "hours" JSONB,
ADD COLUMN "utc_offset_minutes" INTEGER,
ADD COLUMN "time_zone" VARCHAR(64);
