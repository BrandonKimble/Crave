CREATE EXTENSION IF NOT EXISTS "postgis";

CREATE TYPE "market_type" AS ENUM ('cbsa_metro', 'cbsa_micro', 'local_fallback', 'manual');

CREATE TYPE "census_cbsa_type" AS ENUM ('metro', 'micro');

CREATE TABLE "markets" (
    "market_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "market_key" VARCHAR(255) NOT NULL,
    "market_name" VARCHAR(255) NOT NULL,
    "market_short_name" VARCHAR(255),
    "market_type" "market_type" NOT NULL,
    "country_code" VARCHAR(2) NOT NULL DEFAULT 'US',
    "state_code" VARCHAR(8),
    "census_cbsa_code" VARCHAR(8),
    "census_place_geoid" VARCHAR(16),
    "source_subreddit" VARCHAR(100),
    "is_collectable" BOOLEAN NOT NULL DEFAULT false,
    "scheduler_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "center_latitude" DECIMAL(11,8),
    "center_longitude" DECIMAL(11,8),
    "bbox_ne_latitude" DECIMAL(11,8),
    "bbox_ne_longitude" DECIMAL(11,8),
    "bbox_sw_latitude" DECIMAL(11,8),
    "bbox_sw_longitude" DECIMAL(11,8),
    "geometry" geometry(MultiPolygon, 4326),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("market_id")
);

CREATE TABLE "census_cbsa_boundaries" (
    "cbsa_code" VARCHAR(8) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "short_name" VARCHAR(255),
    "cbsa_type" "census_cbsa_type" NOT NULL,
    "country_code" VARCHAR(2) NOT NULL DEFAULT 'US',
    "state_codes" VARCHAR(8)[] DEFAULT ARRAY[]::VARCHAR(8)[],
    "center_latitude" DECIMAL(11,8),
    "center_longitude" DECIMAL(11,8),
    "bbox_ne_latitude" DECIMAL(11,8),
    "bbox_ne_longitude" DECIMAL(11,8),
    "bbox_sw_latitude" DECIMAL(11,8),
    "bbox_sw_longitude" DECIMAL(11,8),
    "geometry" geometry(MultiPolygon, 4326),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "census_cbsa_boundaries_pkey" PRIMARY KEY ("cbsa_code")
);

CREATE TABLE "census_place_boundaries" (
    "place_geoid" VARCHAR(16) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "short_name" VARCHAR(255),
    "state_code" VARCHAR(8) NOT NULL,
    "country_code" VARCHAR(2) NOT NULL DEFAULT 'US',
    "center_latitude" DECIMAL(11,8),
    "center_longitude" DECIMAL(11,8),
    "bbox_ne_latitude" DECIMAL(11,8),
    "bbox_ne_longitude" DECIMAL(11,8),
    "bbox_sw_latitude" DECIMAL(11,8),
    "bbox_sw_longitude" DECIMAL(11,8),
    "geometry" geometry(MultiPolygon, 4326),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "census_place_boundaries_pkey" PRIMARY KEY ("place_geoid")
);

CREATE UNIQUE INDEX "markets_market_key_key" ON "markets"("market_key");
CREATE INDEX "idx_markets_type" ON "markets"("market_type");
CREATE INDEX "idx_markets_source_subreddit" ON "markets"("source_subreddit");
CREATE INDEX "idx_markets_collectable" ON "markets"("is_collectable");
CREATE INDEX "idx_markets_scheduler_enabled" ON "markets"("scheduler_enabled");
CREATE INDEX "idx_markets_cbsa_code" ON "markets"("census_cbsa_code");
CREATE INDEX "idx_markets_place_geoid" ON "markets"("census_place_geoid");
CREATE INDEX "idx_markets_is_active" ON "markets"("is_active");
CREATE INDEX "idx_markets_center" ON "markets"("center_latitude", "center_longitude");
CREATE INDEX "idx_markets_geometry" ON "markets" USING GIST ("geometry");

CREATE INDEX "idx_census_cbsa_type" ON "census_cbsa_boundaries"("cbsa_type");
CREATE INDEX "idx_census_cbsa_center" ON "census_cbsa_boundaries"("center_latitude", "center_longitude");
CREATE INDEX "idx_census_cbsa_geometry" ON "census_cbsa_boundaries" USING GIST ("geometry");

CREATE INDEX "idx_census_places_state_code" ON "census_place_boundaries"("state_code");
CREATE INDEX "idx_census_places_center" ON "census_place_boundaries"("center_latitude", "center_longitude");
CREATE INDEX "idx_census_places_geometry" ON "census_place_boundaries" USING GIST ("geometry");

ALTER TABLE "markets"
  ADD CONSTRAINT "markets_census_cbsa_code_fkey"
  FOREIGN KEY ("census_cbsa_code")
  REFERENCES "census_cbsa_boundaries"("cbsa_code")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "markets"
  ADD CONSTRAINT "markets_census_place_geoid_fkey"
  FOREIGN KEY ("census_place_geoid")
  REFERENCES "census_place_boundaries"("place_geoid")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
