-- Keep actionable on-demand request state distinct per resolved entity lane.
ALTER TABLE "collection_on_demand_requests"
  ADD COLUMN IF NOT EXISTS "entity_identity_key" VARCHAR(64) NOT NULL DEFAULT 'no_entity';

UPDATE "collection_on_demand_requests"
SET "entity_identity_key" = COALESCE("entity_id"::text, 'no_entity');

DROP INDEX IF EXISTS "collection_on_demand_requests_term_entity_type_reason_market_key";
DROP INDEX IF EXISTS "collection_on_demand_requests_term_entity_type_reason_locat_key";
DROP INDEX IF EXISTS "collection_on_demand_requests_term_entity_type_reason_location_key_key";
DROP INDEX IF EXISTS "collection_on_demand_requests_term_entity_type_reason_key";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_on_demand_request_state_entity_lane"
  ON "collection_on_demand_requests"(
    "term",
    "entity_type",
    "reason",
    "market_key",
    "entity_identity_key"
  );

CREATE INDEX IF NOT EXISTS "idx_on_demand_requests_entity_identity"
  ON "collection_on_demand_requests"("entity_identity_key");

-- Favorite demand needs append-only facts so aggregate rebuilds do not depend on
-- mutable current favorite rows.
DO $$
BEGIN
  CREATE TYPE "favorite_event_kind" AS ENUM ('added', 'removed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "user_favorite_events" (
  "favorite_event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "entity_id" UUID NOT NULL,
  "entity_type" "entity_type" NOT NULL,
  "event_kind" "favorite_event_kind" NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_favorite_events_pkey" PRIMARY KEY ("favorite_event_id")
);

ALTER TABLE "user_favorite_events"
  DROP CONSTRAINT IF EXISTS "user_favorite_events_user_id_fkey";

ALTER TABLE "user_favorite_events"
  ADD CONSTRAINT "user_favorite_events_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("user_id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "user_favorite_events"
  DROP CONSTRAINT IF EXISTS "user_favorite_events_entity_id_fkey";

ALTER TABLE "user_favorite_events"
  ADD CONSTRAINT "user_favorite_events_entity_id_fkey"
  FOREIGN KEY ("entity_id")
  REFERENCES "core_entities"("entity_id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_user_favorite_events_occurred_at"
  ON "user_favorite_events"("occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_user_favorite_events_user_time"
  ON "user_favorite_events"("user_id", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_user_favorite_events_entity_time"
  ON "user_favorite_events"("entity_id", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_user_favorite_events_kind_time"
  ON "user_favorite_events"("event_kind", "occurred_at" DESC);

INSERT INTO "user_favorite_events" (
  "user_id",
  "entity_id",
  "entity_type",
  "event_kind",
  "occurred_at",
  "metadata"
)
SELECT
  fav."user_id",
  fav."entity_id",
  fav."entity_type",
  'added'::favorite_event_kind,
  fav."created_at",
  jsonb_build_object('backfillSource', 'user_favorites')
FROM "user_favorites" fav
WHERE NOT EXISTS (
  SELECT 1
  FROM "user_favorite_events" ev
  WHERE ev."user_id" = fav."user_id"
    AND ev."entity_id" = fav."entity_id"
    AND ev."event_kind" = 'added'::favorite_event_kind
    AND ev."occurred_at" = fav."created_at"
);
