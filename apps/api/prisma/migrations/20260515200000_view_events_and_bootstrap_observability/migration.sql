CREATE TABLE "user_entity_view_events" (
  "view_event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "entity_id" UUID NOT NULL,
  "entity_type" "entity_type" NOT NULL,
  "context_restaurant_id" UUID,
  "connection_id" UUID,
  "event_count" INTEGER NOT NULL DEFAULT 1,
  "source" VARCHAR(64),
  "search_request_id" UUID,
  "viewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_entity_view_events_pkey" PRIMARY KEY ("view_event_id")
);

ALTER TABLE "user_entity_view_events"
  ADD CONSTRAINT "user_entity_view_events_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("user_id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "user_entity_view_events"
  ADD CONSTRAINT "user_entity_view_events_entity_id_fkey"
  FOREIGN KEY ("entity_id")
  REFERENCES "core_entities"("entity_id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "user_entity_view_events"
  ADD CONSTRAINT "user_entity_view_events_context_restaurant_id_fkey"
  FOREIGN KEY ("context_restaurant_id")
  REFERENCES "core_entities"("entity_id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "user_entity_view_events"
  ADD CONSTRAINT "user_entity_view_events_connection_id_fkey"
  FOREIGN KEY ("connection_id")
  REFERENCES "core_restaurant_items"("connection_id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "idx_user_entity_view_events_viewed_at"
  ON "user_entity_view_events"("viewed_at" DESC);

CREATE INDEX "idx_user_entity_view_events_user_time"
  ON "user_entity_view_events"("user_id", "viewed_at" DESC);

CREATE INDEX "idx_user_entity_view_events_entity_time"
  ON "user_entity_view_events"("entity_id", "viewed_at" DESC);

CREATE INDEX "idx_user_entity_view_events_context_time"
  ON "user_entity_view_events"("context_restaurant_id", "viewed_at" DESC);

INSERT INTO "user_entity_view_events" (
  "user_id",
  "entity_id",
  "entity_type",
  "context_restaurant_id",
  "event_count",
  "source",
  "search_request_id",
  "viewed_at",
  "metadata",
  "created_at"
)
SELECT
  v."user_id",
  v."restaurant_id",
  'restaurant'::"entity_type",
  v."restaurant_id",
  GREATEST(v."view_count", 1),
  NULLIF(v."metadata"->>'lastSource', ''),
  CASE
    WHEN v."metadata"->>'lastSearchRequestId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (v."metadata"->>'lastSearchRequestId')::uuid
    ELSE NULL
  END,
  v."last_viewed_at",
  jsonb_build_object('backfilledFrom', 'user_restaurant_views'),
  now()
FROM "user_restaurant_views" v
WHERE v."view_count" > 0;

INSERT INTO "user_entity_view_events" (
  "user_id",
  "entity_id",
  "entity_type",
  "context_restaurant_id",
  "connection_id",
  "event_count",
  "source",
  "search_request_id",
  "viewed_at",
  "metadata",
  "created_at"
)
SELECT
  v."user_id",
  v."food_id",
  'food'::"entity_type",
  item."restaurant_id",
  v."connection_id",
  GREATEST(v."view_count", 1),
  NULLIF(v."metadata"->>'lastSource', ''),
  CASE
    WHEN v."metadata"->>'lastSearchRequestId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (v."metadata"->>'lastSearchRequestId')::uuid
    ELSE NULL
  END,
  v."last_viewed_at",
  jsonb_build_object('backfilledFrom', 'user_food_views'),
  now()
FROM "user_food_views" v
JOIN "core_restaurant_items" item
  ON item."connection_id" = v."connection_id"
WHERE v."view_count" > 0;

ALTER TABLE "market_bootstrap_events"
  ADD COLUMN "attempt_index" INTEGER,
  ADD COLUMN "uncovered_area_meters" DOUBLE PRECISION,
  ADD COLUMN "uncovered_area_share" DOUBLE PRECISION,
  ADD COLUMN "candidate_name" VARCHAR(255),
  ADD COLUMN "stop_reason" VARCHAR(64);

CREATE INDEX "idx_market_bootstrap_events_request_created"
  ON "market_bootstrap_events"("request_id", "created_at" DESC);
