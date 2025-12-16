-- Extend search_log with query-level analytics fields.
ALTER TABLE "search_log"
  ADD COLUMN "search_request_id" uuid,
  ADD COLUMN "total_results" integer,
  ADD COLUMN "total_food_results" integer,
  ADD COLUMN "total_restaurant_results" integer,
  ADD COLUMN "query_execution_time_ms" integer,
  ADD COLUMN "coverage_status" varchar(32);

-- Ensure the primary location pointer on entities stays unique (nullable unique is ok).
CREATE UNIQUE INDEX "entities_primary_location_id_key" ON "entities"("primary_location_id");

-- Query-level grouping + history/suggestions helpers.
CREATE INDEX "idx_search_log_user_request" ON "search_log" ("user_id", "search_request_id");
CREATE INDEX "idx_search_log_user_query" ON "search_log" ("user_id", "query_text");
CREATE INDEX "idx_search_log_query_text" ON "search_log" ("query_text");
CREATE UNIQUE INDEX "uq_search_log_request_entity" ON "search_log" ("search_request_id", "entity_id");

-- Case-insensitive prefix helpers for query suggestions.
CREATE INDEX "idx_search_log_query_text_trgm"
  ON "search_log"
  USING gin ("query_text" gin_trgm_ops);

-- Recently viewed restaurants (aggregate state).
CREATE TABLE "restaurant_views" (
  "user_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "last_viewed_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "view_count" integer NOT NULL DEFAULT 1,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT "restaurant_views_pkey" PRIMARY KEY ("user_id", "restaurant_id"),
  CONSTRAINT "restaurant_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE,
  CONSTRAINT "restaurant_views_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "entities"("entity_id") ON DELETE CASCADE
);

CREATE INDEX "idx_restaurant_views_user_time" ON "restaurant_views" ("user_id", "last_viewed_at" DESC);
CREATE INDEX "idx_restaurant_views_restaurant" ON "restaurant_views" ("restaurant_id");

-- Expand entity_priority with app-demand signals.
ALTER TABLE "entity_priority"
  ADD COLUMN "view_impressions" integer NOT NULL DEFAULT 0,
  ADD COLUMN "last_view_at" timestamp(3),
  ADD COLUMN "favorite_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "autocomplete_selections" integer NOT NULL DEFAULT 0;
