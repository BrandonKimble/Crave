-- Rebuildable daily demand aggregate. Raw facts remain the source of truth.
CREATE TYPE "demand_subject_kind" AS ENUM ('entity', 'query', 'term');
CREATE TYPE "demand_source_kind" AS ENUM (
  'search_log',
  'on_demand',
  'restaurant_view',
  'food_view',
  'favorite'
);
CREATE TYPE "demand_signal_kind" AS ENUM (
  'backend',
  'cache',
  'autocomplete_selection',
  'recent_submit',
  'low_result',
  'unresolved_query',
  'restaurant_view',
  'food_view',
  'favorite'
);

CREATE TABLE "user_search_demand_daily" (
  "demand_daily_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "demand_date" DATE NOT NULL,
  "user_id" UUID,
  "market_key" VARCHAR(255),
  "collectable_market_key" VARCHAR(255),
  "subject_kind" "demand_subject_kind" NOT NULL,
  "subject_key" VARCHAR(500) NOT NULL,
  "entity_id" UUID,
  "entity_type" "entity_type",
  "normalized_text" VARCHAR(500),
  "source_kind" "demand_source_kind" NOT NULL,
  "signal_kind" "demand_signal_kind" NOT NULL,
  "reason" VARCHAR(64),
  "signal_count" INTEGER NOT NULL DEFAULT 0,
  "first_seen_at" TIMESTAMPTZ NOT NULL,
  "last_seen_at" TIMESTAMPTZ NOT NULL,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "user_search_demand_daily_pkey" PRIMARY KEY ("demand_daily_id")
);

ALTER TABLE "user_search_demand_daily"
  ADD CONSTRAINT "user_search_demand_daily_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("user_id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "user_search_demand_daily"
  ADD CONSTRAINT "user_search_demand_daily_entity_id_fkey"
  FOREIGN KEY ("entity_id")
  REFERENCES "core_entities"("entity_id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "uq_search_demand_daily_scope"
  ON "user_search_demand_daily" (
    "demand_date",
    COALESCE("user_id", '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("market_key", ''),
    COALESCE("collectable_market_key", ''),
    "subject_kind",
    "subject_key",
    "source_kind",
    "signal_kind",
    COALESCE("reason", '')
  );

CREATE INDEX "idx_search_demand_daily_date"
  ON "user_search_demand_daily" ("demand_date");

CREATE INDEX "idx_search_demand_daily_subject_date"
  ON "user_search_demand_daily" ("subject_kind", "subject_key", "demand_date");

CREATE INDEX "idx_search_demand_daily_entity_date"
  ON "user_search_demand_daily" ("entity_id", "demand_date");

CREATE INDEX "idx_search_demand_daily_market_subject_date"
  ON "user_search_demand_daily" ("market_key", "subject_kind", "demand_date");

CREATE INDEX "idx_search_demand_daily_collectable_subject_date"
  ON "user_search_demand_daily" ("collectable_market_key", "subject_kind", "demand_date");

CREATE INDEX "idx_search_demand_daily_source_signal_date"
  ON "user_search_demand_daily" ("source_kind", "signal_kind", "demand_date");

CREATE INDEX "idx_search_demand_daily_user_date"
  ON "user_search_demand_daily" ("user_id", "demand_date");
