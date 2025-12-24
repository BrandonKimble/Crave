-- CreateEnum
CREATE TYPE "coverage_source_type" AS ENUM ('all', 'poll_only');

-- AlterEnum
-- Add new poll topic types for attribute-based polls.
ALTER TYPE "poll_topic_type" ADD VALUE 'best_dish_attribute';
ALTER TYPE "poll_topic_type" ADD VALUE 'best_restaurant_attribute';

-- Rename table for coverage registry.
ALTER TABLE "collection_subreddits" RENAME TO "coverage_areas";
ALTER TABLE "coverage_areas" RENAME CONSTRAINT "collection_subreddits_pkey" TO "coverage_areas_pkey";

ALTER INDEX "collection_subreddits_name_key" RENAME TO "coverage_areas_name_key";
ALTER INDEX "collection_subreddits_name_idx" RENAME TO "coverage_areas_name_idx";
ALTER INDEX "collection_subreddits_is_active_idx" RENAME TO "idx_coverage_areas_active";
ALTER INDEX "collection_subreddits_last_processed_idx" RENAME TO "idx_coverage_areas_last_processed";
ALTER INDEX "collection_subreddits_safe_interval_days_idx" RENAME TO "idx_coverage_areas_safe_interval";
ALTER INDEX "idx_collection_subreddits_coverage_key" RENAME TO "idx_coverage_areas_coverage_key";

-- Add new coverage registry fields.
ALTER TABLE "coverage_areas"
  ADD COLUMN "display_name" VARCHAR(255),
  ADD COLUMN "source_type" "coverage_source_type" NOT NULL DEFAULT 'all';

-- Rename poll city columns to coverage key and extend topics for attributes.
ALTER TABLE "poll_topics" RENAME COLUMN "city" TO "coverage_key";
ALTER TABLE "polls" RENAME COLUMN "city" TO "coverage_key";

ALTER TABLE "poll_topics"
  ADD COLUMN "target_food_attribute_id" UUID,
  ADD COLUMN "target_restaurant_attribute_id" UUID;

ALTER INDEX "idx_poll_topics_city" RENAME TO "idx_poll_topics_coverage_key";
ALTER INDEX "idx_polls_city" RENAME TO "idx_polls_coverage_key";

ALTER TABLE "poll_topics" ADD CONSTRAINT "poll_topics_target_food_attribute_id_fkey" FOREIGN KEY ("target_food_attribute_id") REFERENCES "core_entities"("entity_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "poll_topics" ADD CONSTRAINT "poll_topics_target_restaurant_attribute_id_fkey" FOREIGN KEY ("target_restaurant_attribute_id") REFERENCES "core_entities"("entity_id") ON DELETE SET NULL ON UPDATE CASCADE;
