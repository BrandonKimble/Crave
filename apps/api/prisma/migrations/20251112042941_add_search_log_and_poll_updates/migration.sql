/*
  Warnings:

  - You are about to drop the column `query_clicks` on the `entity_priority` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "poll_topic_type" AS ENUM ('best_dish', 'what_to_order');

-- CreateEnum
CREATE TYPE "search_log_source" AS ENUM ('search', 'poll');

-- AlterTable
ALTER TABLE "entity_priority" DROP COLUMN "query_clicks";

-- AlterTable
ALTER TABLE "poll_options" ADD COLUMN     "category_id" UUID,
ADD COLUMN     "connection_id" UUID,
ADD COLUMN     "food_id" UUID,
ADD COLUMN     "restaurant_id" UUID;

-- AlterTable
ALTER TABLE "poll_topics" ADD COLUMN     "target_dish_id" UUID,
ADD COLUMN     "target_restaurant_id" UUID,
ADD COLUMN     "topic_type" "poll_topic_type" NOT NULL DEFAULT 'best_dish';

-- CreateTable
CREATE TABLE "poll_category_aggregates" (
    "restaurant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "pseudo_mentions" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "pseudo_upvotes" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "vote_count" INTEGER NOT NULL DEFAULT 0,
    "last_vote_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_category_aggregates_pkey" PRIMARY KEY ("restaurant_id","category_id")
);

-- CreateTable
CREATE TABLE "search_log" (
    "log_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_id" UUID NOT NULL,
    "entity_type" "entity_type" NOT NULL,
    "location_key" VARCHAR(255),
    "query_text" VARCHAR(500),
    "source" "search_log_source" NOT NULL DEFAULT 'search',
    "metadata" JSONB DEFAULT '{}',
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateIndex
CREATE INDEX "idx_poll_category_aggregate_category" ON "poll_category_aggregates"("category_id");

-- CreateIndex
CREATE INDEX "idx_search_log_entity" ON "search_log"("entity_id");

-- CreateIndex
CREATE INDEX "idx_search_log_location" ON "search_log"("location_key");

-- CreateIndex
CREATE INDEX "idx_search_log_logged_at" ON "search_log"("logged_at" DESC);

-- CreateIndex
CREATE INDEX "idx_search_log_entity_location_time" ON "search_log"("entity_id", "location_key", "logged_at");

-- CreateIndex
CREATE INDEX "idx_poll_options_restaurant_id" ON "poll_options"("restaurant_id");

-- CreateIndex
CREATE INDEX "idx_poll_options_food_id" ON "poll_options"("food_id");

-- CreateIndex
CREATE INDEX "idx_poll_options_connection_id" ON "poll_options"("connection_id");

-- CreateIndex
CREATE INDEX "idx_poll_options_category_id" ON "poll_options"("category_id");

-- AddForeignKey
ALTER TABLE "poll_topics" ADD CONSTRAINT "poll_topics_target_dish_id_fkey" FOREIGN KEY ("target_dish_id") REFERENCES "entities"("entity_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_topics" ADD CONSTRAINT "poll_topics_target_restaurant_id_fkey" FOREIGN KEY ("target_restaurant_id") REFERENCES "entities"("entity_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "entities"("entity_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "entities"("entity_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "entities"("entity_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("connection_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_log" ADD CONSTRAINT "search_log_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;
