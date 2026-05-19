-- Add provider-neutral source boundaries while keeping core_markets as the runtime contract.

ALTER TABLE "core_markets"
  DROP CONSTRAINT IF EXISTS "core_markets_census_place_geoid_fkey";

DROP INDEX IF EXISTS "idx_core_markets_place_geoid";

ALTER TABLE "core_markets"
  DROP COLUMN IF EXISTS "census_place_geoid";

DROP TABLE IF EXISTS "geo_census_place_boundaries";

ALTER TYPE "market_type" ADD VALUE IF NOT EXISTS 'locality';

CREATE TABLE "geo_boundary_features" (
  "boundary_feature_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_provider" VARCHAR(64) NOT NULL,
  "source_boundary_id" VARCHAR(255) NOT NULL,
  "source_boundary_type" VARCHAR(64) NOT NULL,
  "provider_type" VARCHAR(64) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "short_name" VARCHAR(255),
  "country_code" VARCHAR(2) NOT NULL DEFAULT 'US',
  "state_code" VARCHAR(8),
  "center_latitude" DECIMAL(11, 8),
  "center_longitude" DECIMAL(11, 8),
  "bbox_ne_latitude" DECIMAL(11, 8),
  "bbox_ne_longitude" DECIMAL(11, 8),
  "bbox_sw_latitude" DECIMAL(11, 8),
  "bbox_sw_longitude" DECIMAL(11, 8),
  "geometry" geometry(MultiPolygon, 4326),
  "metadata" JSONB DEFAULT '{}',
  "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "geo_boundary_features_pkey" PRIMARY KEY ("boundary_feature_id")
);

CREATE UNIQUE INDEX "uq_geo_boundary_features_source"
  ON "geo_boundary_features"("source_provider", "source_boundary_id", "source_boundary_type");

CREATE INDEX "idx_geo_boundary_features_source_type"
  ON "geo_boundary_features"("source_provider", "source_boundary_type");

CREATE INDEX "idx_geo_boundary_features_state"
  ON "geo_boundary_features"("state_code");

CREATE INDEX "idx_geo_boundary_features_center"
  ON "geo_boundary_features"("center_latitude", "center_longitude");

CREATE INDEX "idx_geo_boundary_features_geometry"
  ON "geo_boundary_features" USING GIST ("geometry");

CREATE TABLE "market_bootstrap_events" (
  "market_bootstrap_event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_id" UUID,
  "source_provider" VARCHAR(64) NOT NULL,
  "source_boundary_id" VARCHAR(255),
  "source_boundary_type" VARCHAR(64),
  "event_type" VARCHAR(64) NOT NULL,
  "trigger_kind" VARCHAR(64),
  "market_key" VARCHAR(255),
  "lookup_latitude" DECIMAL(11, 8),
  "lookup_longitude" DECIMAL(11, 8),
  "message" TEXT,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "market_bootstrap_events_pkey" PRIMARY KEY ("market_bootstrap_event_id")
);

CREATE INDEX "idx_market_bootstrap_events_source"
  ON "market_bootstrap_events"("source_provider", "source_boundary_id", "source_boundary_type");

CREATE INDEX "idx_market_bootstrap_events_event_type"
  ON "market_bootstrap_events"("event_type");

CREATE INDEX "idx_market_bootstrap_events_created_at"
  ON "market_bootstrap_events"("created_at" DESC);

ALTER TABLE "core_markets"
  ADD COLUMN "source_boundary_provider" VARCHAR(64),
  ADD COLUMN "source_boundary_id" VARCHAR(255),
  ADD COLUMN "source_boundary_type" VARCHAR(64);

CREATE INDEX "idx_core_markets_source_boundary"
  ON "core_markets"("source_boundary_provider", "source_boundary_id");

CREATE UNIQUE INDEX "uq_core_markets_source_boundary"
  ON "core_markets"("source_boundary_provider", "source_boundary_id", "source_boundary_type")
  WHERE "source_boundary_provider" IS NOT NULL
    AND "source_boundary_id" IS NOT NULL
    AND "source_boundary_type" IS NOT NULL;
