-- Add primary location pointer to entities
ALTER TABLE "entities" ADD COLUMN "primary_location_id" uuid;

-- New table for per-restaurant locations
CREATE TABLE "restaurant_locations" (
  "location_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "restaurant_id" uuid NOT NULL,
  "google_place_id" varchar(255),
  "latitude" numeric(10, 8),
  "longitude" numeric(11, 8),
  "address" varchar(500),
  "city" varchar(255),
  "region" varchar(255),
  "country" varchar(2),
  "postal_code" varchar(32),
  "price_level" smallint,
  "price_level_updated_at" timestamp(3),
  "metadata" jsonb,
  "is_primary" boolean NOT NULL DEFAULT false,
  "last_polled_at" timestamp(3),
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_locations_pkey" PRIMARY KEY ("location_id"),
  CONSTRAINT "restaurant_locations_google_place_id_key" UNIQUE ("google_place_id"),
  CONSTRAINT "restaurant_locations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "entities"("entity_id") ON DELETE CASCADE
);

CREATE INDEX "idx_restaurant_locations_restaurant" ON "restaurant_locations" ("restaurant_id");
CREATE INDEX "idx_restaurant_locations_primary" ON "restaurant_locations" ("restaurant_id", "is_primary");
CREATE INDEX "idx_restaurant_locations_location" ON "restaurant_locations" ("longitude", "latitude");
CREATE INDEX "idx_restaurant_locations_google_place_id" ON "restaurant_locations" ("google_place_id");

-- Backfill location rows from existing entity data
INSERT INTO "restaurant_locations" (
  "location_id",
  "restaurant_id",
  "google_place_id",
  "latitude",
  "longitude",
  "address",
  "city",
  "region",
  "country",
  "postal_code",
  "price_level",
  "price_level_updated_at",
  "metadata",
  "is_primary",
  "last_polled_at",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  e.entity_id,
  e.google_place_id,
  e.latitude,
  e.longitude,
  e.address,
  e.city,
  e.region,
  e.country,
  e.postal_code,
  e.price_level,
  e.price_level_updated_at,
  e.restaurant_metadata,
  TRUE,
  NULL,
  e.created_at,
  CURRENT_TIMESTAMP
FROM "entities" e
WHERE e.type = 'restaurant';

-- Point entities to their primary location
UPDATE "entities" e
SET "primary_location_id" = rl.location_id
FROM "restaurant_locations" rl
WHERE rl.restaurant_id = e.entity_id AND rl.is_primary = TRUE;

-- Maintain legacy columns for backward compatibility; new writes should target restaurant_locations.

ALTER TABLE "entities"
  ADD CONSTRAINT "entities_primary_location_id_fkey"
  FOREIGN KEY ("primary_location_id") REFERENCES "restaurant_locations"("location_id") ON DELETE SET NULL;
