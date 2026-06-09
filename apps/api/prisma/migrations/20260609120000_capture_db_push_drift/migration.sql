-- CreateEnum
CREATE TYPE "search_event_kind" AS ENUM ('backend', 'cache');

-- DropForeignKey
ALTER TABLE "public"."user_search_logs" DROP CONSTRAINT "user_search_logs_entity_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_search_logs" DROP CONSTRAINT "user_search_logs_user_id_fkey";

-- DropIndex
DROP INDEX "public"."idx_core_markets_geometry";

-- DropIndex
DROP INDEX "public"."uq_demand_scoring_candidate_scope";

-- DropIndex
DROP INDEX "public"."idx_favorite_lists_updated_at";

-- DropIndex
DROP INDEX "public"."idx_geo_boundary_features_geometry";

-- DropIndex
DROP INDEX "public"."idx_market_bootstrap_events_request_created";

-- DropIndex
DROP INDEX "public"."uq_search_demand_daily_scope";

-- AlterTable
ALTER TABLE "collection_extraction_runs" ALTER COLUMN "status" DROP DEFAULT;

-- AlterTable
ALTER TABLE "collection_on_demand_request_users" ALTER COLUMN "first_seen_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "last_seen_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "collection_on_demand_requests" ALTER COLUMN "last_queued_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "collection_processed_sources" RENAME CONSTRAINT "collection_sources_pkey" TO "collection_processed_sources_pkey";

-- AlterTable
ALTER TABLE "core_restaurant_entity_signals" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "core_restaurant_items" RENAME CONSTRAINT "core_connections_pkey" TO "core_restaurant_items_pkey";

-- AlterTable
ALTER TABLE "demand_scoring_candidates" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "demand_scoring_runs" ALTER COLUMN "cycle_start_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "cycle_end_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "started_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "finished_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "favorite_list_items" ALTER COLUMN "item_id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "favorite_list_share_events" ALTER COLUMN "event_id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "favorite_lists" ALTER COLUMN "list_id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "geo_boundary_features" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_food_views" ALTER COLUMN "last_viewed_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_search_demand_daily" ALTER COLUMN "first_seen_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "last_seen_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- DropTable
DROP TABLE "public"."user_search_logs";

-- DropEnum
DROP TYPE "public"."search_log_event_kind";

-- CreateTable
CREATE TABLE "search_events" (
    "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "search_request_id" UUID NOT NULL,
    "user_id" UUID,
    "query_text" VARCHAR(500),
    "event_kind" "search_event_kind" NOT NULL DEFAULT 'backend',
    "primary_market_key" VARCHAR(255),
    "total_results" INTEGER,
    "total_food_results" INTEGER,
    "total_restaurant_results" INTEGER,
    "query_execution_time_ms" INTEGER,
    "market_status" VARCHAR(32),
    "submission_source" VARCHAR(32),
    "metadata" JSONB DEFAULT '{}',
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "search_event_entities" (
    "attribution_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "entity_type" "entity_type" NOT NULL,
    "user_id" UUID,
    "market_key" VARCHAR(255),
    "collectable_market_key" VARCHAR(255),
    "rank" INTEGER,
    "event_kind" "search_event_kind" NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_event_entities_pkey" PRIMARY KEY ("attribution_id")
);

-- CreateIndex
CREATE INDEX "idx_search_events_user_query" ON "search_events"("user_id", "query_text");

-- CreateIndex
CREATE INDEX "idx_search_events_user_kind_time" ON "search_events"("user_id", "event_kind", "logged_at" DESC);

-- CreateIndex
CREATE INDEX "idx_search_events_query_text" ON "search_events"("query_text");

-- CreateIndex
CREATE INDEX "idx_search_events_kind_time" ON "search_events"("event_kind", "logged_at" DESC);

-- CreateIndex
CREATE INDEX "idx_search_events_market_kind_time" ON "search_events"("primary_market_key", "event_kind", "logged_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_search_events_request" ON "search_events"("search_request_id");

-- CreateIndex
CREATE INDEX "idx_search_event_entities_event" ON "search_event_entities"("event_id");

-- CreateIndex
CREATE INDEX "idx_search_event_entities_entity_user" ON "search_event_entities"("entity_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_search_event_entities_entity_market_time" ON "search_event_entities"("entity_id", "market_key", "logged_at");

-- CreateIndex
CREATE INDEX "idx_search_event_entities_entity_collectable_time" ON "search_event_entities"("entity_id", "collectable_market_key", "logged_at");

-- CreateIndex
CREATE INDEX "idx_search_event_entities_entity_kind_time" ON "search_event_entities"("entity_id", "event_kind", "logged_at" DESC);

-- CreateIndex
CREATE INDEX "idx_search_event_entities_market_kind_time" ON "search_event_entities"("market_key", "event_kind", "logged_at" DESC);

-- CreateIndex
CREATE INDEX "idx_search_event_entities_collectable_kind_time" ON "search_event_entities"("collectable_market_key", "event_kind", "logged_at" DESC);

-- CreateIndex
CREATE INDEX "idx_favorite_lists_updated_at" ON "favorite_lists"("updated_at" DESC);

-- RenameForeignKey
ALTER TABLE "core_markets" RENAME CONSTRAINT "core_markets_source_boundary_fkey" TO "core_markets_source_boundary_provider_source_boundary_id_s_fkey";

-- RenameForeignKey
ALTER TABLE "core_restaurant_items" RENAME CONSTRAINT "core_connections_food_id_fkey" TO "core_restaurant_items_food_id_fkey";

-- RenameForeignKey
ALTER TABLE "core_restaurant_items" RENAME CONSTRAINT "core_connections_restaurant_id_fkey" TO "core_restaurant_items_restaurant_id_fkey";

-- AddForeignKey
ALTER TABLE "search_events" ADD CONSTRAINT "search_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_event_entities" ADD CONSTRAINT "search_event_entities_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "search_events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_event_entities" ADD CONSTRAINT "search_event_entities_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "core_entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "core_connections_restaurant_id_food_id_key" RENAME TO "core_restaurant_items_restaurant_id_food_id_key";

