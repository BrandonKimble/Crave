-- Search log event semantics: backend load vs cache reveal attribution.
DO $$
BEGIN
  CREATE TYPE "search_log_event_kind" AS ENUM ('backend', 'cache');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DELETE FROM "user_search_logs"
WHERE "source" IS NOT NULL
  AND "source" <> 'search';

ALTER TABLE "user_search_logs"
  ADD COLUMN IF NOT EXISTS "event_kind" "search_log_event_kind" NOT NULL DEFAULT 'backend';

ALTER TABLE "user_search_logs"
  DROP CONSTRAINT IF EXISTS "uq_search_log_request_entity";

DROP INDEX IF EXISTS "uq_search_log_request_entity";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_search_log_request_entity_market"
  ON "user_search_logs" (
    "search_request_id",
    "entity_id",
    COALESCE("market_key", ''),
    COALESCE("collectable_market_key", '')
  );

CREATE INDEX IF NOT EXISTS "idx_search_log_event_logged_at"
  ON "user_search_logs" ("event_kind", "logged_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_search_log_user_event_query_time"
  ON "user_search_logs" ("user_id", "event_kind", "query_text", "logged_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_search_log_market_event_time"
  ON "user_search_logs" ("market_key", "event_kind", "logged_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_search_log_collectable_event_time"
  ON "user_search_logs" ("collectable_market_key", "event_kind", "logged_at" DESC);

ALTER TABLE "user_search_logs"
  DROP COLUMN IF EXISTS "source";

DROP TYPE IF EXISTS "search_log_source";

-- On-demand raw ask facts. Queue cooldown can suppress work, but not demand facts.
ALTER TABLE "collection_on_demand_requests"
  ADD COLUMN IF NOT EXISTS "last_queued_at" TIMESTAMPTZ;

UPDATE "collection_on_demand_requests"
SET "last_queued_at" = "last_seen_at";

CREATE INDEX IF NOT EXISTS "idx_on_demand_requests_last_queued_at"
  ON "collection_on_demand_requests" ("last_queued_at" DESC);

CREATE TABLE IF NOT EXISTS "collection_on_demand_ask_events" (
  "ask_event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_id" UUID,
  "user_id" UUID,
  "term" VARCHAR(255) NOT NULL,
  "entity_type" "entity_type" NOT NULL,
  "entity_id" UUID,
  "reason" "OnDemandReason" NOT NULL,
  "market_key" VARCHAR(255) NOT NULL,
  "result_restaurant_count" INTEGER,
  "result_food_count" INTEGER,
  "asked_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "metadata" JSONB DEFAULT '{}',

  CONSTRAINT "collection_on_demand_ask_events_pkey" PRIMARY KEY ("ask_event_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collection_on_demand_ask_events_request_id_fkey'
  ) THEN
    ALTER TABLE "collection_on_demand_ask_events"
      ADD CONSTRAINT "collection_on_demand_ask_events_request_id_fkey"
      FOREIGN KEY ("request_id")
      REFERENCES "collection_on_demand_requests"("request_id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collection_on_demand_ask_events_user_id_fkey'
  ) THEN
    ALTER TABLE "collection_on_demand_ask_events"
      ADD CONSTRAINT "collection_on_demand_ask_events_user_id_fkey"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("user_id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collection_on_demand_ask_events_entity_id_fkey'
  ) THEN
    ALTER TABLE "collection_on_demand_ask_events"
      ADD CONSTRAINT "collection_on_demand_ask_events_entity_id_fkey"
      FOREIGN KEY ("entity_id")
      REFERENCES "core_entities"("entity_id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_on_demand_ask_events_asked_at"
  ON "collection_on_demand_ask_events" ("asked_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_on_demand_ask_events_market_time"
  ON "collection_on_demand_ask_events" ("market_key", "asked_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_on_demand_ask_events_request_time"
  ON "collection_on_demand_ask_events" ("request_id", "asked_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_on_demand_ask_events_user_time"
  ON "collection_on_demand_ask_events" ("user_id", "asked_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_on_demand_ask_events_reason_type_market"
  ON "collection_on_demand_ask_events" ("reason", "entity_type", "market_key", "asked_at" DESC);

ALTER TABLE "collection_on_demand_request_users"
  ADD COLUMN IF NOT EXISTS "first_seen_at" TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "ask_count" INTEGER NOT NULL DEFAULT 1;

UPDATE "collection_on_demand_request_users"
SET
  "first_seen_at" = COALESCE("created_at", now()),
  "last_seen_at" = COALESCE("created_at", now());

ALTER TABLE "collection_on_demand_request_users"
  ALTER COLUMN "first_seen_at" SET NOT NULL,
  ALTER COLUMN "last_seen_at" SET NOT NULL;

DROP INDEX IF EXISTS "idx_collection_on_demand_request_users_created_at";

CREATE INDEX IF NOT EXISTS "idx_collection_on_demand_request_users_last_seen_at"
  ON "collection_on_demand_request_users" ("last_seen_at" DESC);

ALTER TABLE "collection_on_demand_request_users"
  DROP COLUMN IF EXISTS "created_at";
