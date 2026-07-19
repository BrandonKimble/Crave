-- Phase A substrate (master plan §1/§3): Place Catalog (containment DAG, open
-- level codes, two-tier geometry) + Signals Ledger (append-only, immutable) +
-- pseudonymous actors + entity redirects.

CREATE TABLE "places" (
  "place_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "local_script_alias" VARCHAR(255),
  "provider_level_code" VARCHAR(64) NOT NULL,
  "country_code" VARCHAR(2) NOT NULL,
  "subdivision_code" VARCHAR(8),
  "parent_place_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "centroid_lat" DECIMAL(10,8),
  "centroid_lng" DECIMAL(11,8),
  "bbox_min_lat" DECIMAL(10,8),
  "bbox_min_lng" DECIMAL(11,8),
  "bbox_max_lat" DECIMAL(10,8),
  "bbox_max_lng" DECIMAL(11,8),
  "time_zone" VARCHAR(64),
  "provider" VARCHAR(32) NOT NULL DEFAULT 'tomtom',
  "provider_place_id" VARCHAR(128),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "promoted_at" TIMESTAMP(3),
  CONSTRAINT "places_pkey" PRIMARY KEY ("place_id")
);
CREATE UNIQUE INDEX "uq_places_identity" ON "places"("country_code", "subdivision_code", "provider_level_code", "name");
CREATE INDEX "places_country_code_subdivision_code_idx" ON "places"("country_code", "subdivision_code");
CREATE INDEX "places_provider_place_id_idx" ON "places"("provider_place_id");

CREATE TABLE "place_geometries" (
  "place_id" UUID NOT NULL,
  "provider_boundary_id" VARCHAR(128),
  "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "geometry" geometry(MultiPolygon, 4326),
  CONSTRAINT "place_geometries_pkey" PRIMARY KEY ("place_id")
);
CREATE INDEX "idx_place_geometries_geom" ON "place_geometries" USING GIST ("geometry");

CREATE TABLE "signals" (
  "signal_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" VARCHAR(32) NOT NULL,
  "subject_type" VARCHAR(16) NOT NULL,
  "subject_id" UUID,
  "subject_text" VARCHAR(255),
  "geo_min_lat" DECIMAL(10,8) NOT NULL,
  "geo_min_lng" DECIMAL(11,8) NOT NULL,
  "geo_max_lat" DECIMAL(10,8) NOT NULL,
  "geo_max_lng" DECIMAL(11,8) NOT NULL,
  "actor_id" UUID NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "meta" JSONB,
  CONSTRAINT "signals_pkey" PRIMARY KEY ("signal_id")
);
CREATE INDEX "signals_occurred_at_idx" ON "signals"("occurred_at");
CREATE INDEX "signals_kind_occurred_at_idx" ON "signals"("kind", "occurred_at");
CREATE INDEX "signals_subject_id_idx" ON "signals"("subject_id");

CREATE TABLE "signal_actors" (
  "actor_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "device_key" VARCHAR(128),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "signal_actors_pkey" PRIMARY KEY ("actor_id")
);
CREATE UNIQUE INDEX "signal_actors_user_id_key" ON "signal_actors"("user_id");
CREATE UNIQUE INDEX "signal_actors_device_key_key" ON "signal_actors"("device_key");

CREATE TABLE "entity_redirects" (
  "from_entity_id" UUID NOT NULL,
  "to_entity_id" UUID NOT NULL,
  "redirected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entity_redirects_pkey" PRIMARY KEY ("from_entity_id")
);
CREATE INDEX "entity_redirects_to_entity_id_idx" ON "entity_redirects"("to_entity_id");
