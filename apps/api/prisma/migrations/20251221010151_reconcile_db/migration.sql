-- DropForeignKey
ALTER TABLE "public"."core_category_aggregates" DROP CONSTRAINT "category_aggregates_category_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."core_category_aggregates" DROP CONSTRAINT "category_aggregates_restaurant_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."core_entities" DROP CONSTRAINT "entities_primary_location_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."core_restaurant_locations" DROP CONSTRAINT "restaurant_locations_restaurant_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_favorites" DROP CONSTRAINT "user_favorites_entity_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_favorites" DROP CONSTRAINT "user_favorites_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_restaurant_views" DROP CONSTRAINT "restaurant_views_restaurant_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_restaurant_views" DROP CONSTRAINT "restaurant_views_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_search_logs" DROP CONSTRAINT "search_log_user_id_fkey";

-- DropIndex
DROP INDEX "public"."idx_on_demand_entity";

-- DropIndex
DROP INDEX "public"."idx_on_demand_reason";

-- DropIndex
DROP INDEX "public"."idx_on_demand_status";

-- DropIndex
DROP INDEX "public"."on_demand_term_entity_type_reason_key";

-- DropIndex
DROP INDEX "public"."connections_restaurant_id_food_id_food_attribut_key";

-- DropIndex
DROP INDEX "public"."entities_name_type_key";

-- DropIndex
DROP INDEX "public"."idx_entities_aliases";

-- DropIndex
DROP INDEX "public"."idx_entities_name";

-- DropIndex
DROP INDEX "public"."idx_entities_name_trgm";

-- DropIndex
DROP INDEX "public"."idx_search_log_query_text_trgm";

-- AlterTable
ALTER TABLE "billing_checkout_sessions" RENAME CONSTRAINT "checkout_sessions_pkey" TO "billing_checkout_sessions_pkey";

-- AlterTable
ALTER TABLE "billing_entitlements" RENAME CONSTRAINT "user_entitlements_pkey" TO "billing_entitlements_pkey";

-- AlterTable
ALTER TABLE "billing_subscriptions" RENAME CONSTRAINT "subscriptions_pkey" TO "billing_subscriptions_pkey";

-- AlterTable
ALTER TABLE "collection_entity_priority_metrics" RENAME CONSTRAINT "entity_priority_pkey" TO "collection_entity_priority_metrics_pkey";

-- AlterTable
ALTER TABLE "collection_on_demand_requests" RENAME CONSTRAINT "on_demand_pkey" TO "collection_on_demand_requests_pkey";

-- AlterTable
ALTER TABLE "collection_sources" RENAME CONSTRAINT "source_pkey" TO "collection_sources_pkey";

-- AlterTable
ALTER TABLE "collection_subreddits" RENAME CONSTRAINT "subreddits_pkey" TO "collection_subreddits_pkey";

ALTER TABLE "collection_subreddits"
ALTER COLUMN "center_latitude" SET DATA TYPE DECIMAL(11,8);

-- AlterTable
ALTER TABLE "core_boosts" RENAME CONSTRAINT "boosts_pkey" TO "core_boosts_pkey";

-- AlterTable
ALTER TABLE "core_category_aggregates" RENAME CONSTRAINT "category_aggregates_pkey" TO "core_category_aggregates_pkey";

-- AlterTable
ALTER TABLE "core_connections" RENAME CONSTRAINT "connections_pkey" TO "core_connections_pkey";

-- AlterTable
ALTER TABLE "core_entities" RENAME CONSTRAINT "entities_pkey" TO "core_entities_pkey";

-- AlterTable
ALTER TABLE "core_restaurant_locations" RENAME CONSTRAINT "restaurant_locations_pkey" TO "core_restaurant_locations_pkey";

ALTER TABLE "core_restaurant_locations"
ALTER COLUMN "price_level" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "user_favorites" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_restaurant_views" RENAME CONSTRAINT "restaurant_views_pkey" TO "user_restaurant_views_pkey";

-- AlterTable
ALTER TABLE "user_search_logs" RENAME CONSTRAINT "search_log_pkey" TO "user_search_logs_pkey";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_entities_name" ON "core_entities"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_entities_aliases" ON "core_entities"("aliases");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_entities_restaurant_attributes" ON "core_entities"("restaurant_attributes");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_entities_address" ON "core_entities"("address");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_entities_primary_location" ON "core_entities"("primary_location_id");

-- RenameForeignKey
ALTER TABLE "billing_checkout_sessions" RENAME CONSTRAINT "checkout_sessions_user_id_fkey" TO "billing_checkout_sessions_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "billing_entitlements" RENAME CONSTRAINT "user_entitlements_user_id_fkey" TO "billing_entitlements_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "billing_subscriptions" RENAME CONSTRAINT "subscriptions_user_id_fkey" TO "billing_subscriptions_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "collection_entity_priority_metrics" RENAME CONSTRAINT "entity_priority_entity_id_fkey" TO "collection_entity_priority_metrics_entity_id_fkey";

-- RenameForeignKey
ALTER TABLE "collection_on_demand_requests" RENAME CONSTRAINT "on_demand_entity_id_fkey" TO "collection_on_demand_requests_entity_id_fkey";

-- RenameForeignKey
ALTER TABLE "core_connections" RENAME CONSTRAINT "connections_food_id_fkey" TO "core_connections_food_id_fkey";

-- RenameForeignKey
ALTER TABLE "core_connections" RENAME CONSTRAINT "connections_restaurant_id_fkey" TO "core_connections_restaurant_id_fkey";

-- RenameForeignKey
ALTER TABLE "user_search_logs" RENAME CONSTRAINT "search_log_entity_id_fkey" TO "user_search_logs_entity_id_fkey";

-- AddForeignKey
ALTER TABLE "core_entities" ADD CONSTRAINT "core_entities_primary_location_id_fkey" FOREIGN KEY ("primary_location_id") REFERENCES "core_restaurant_locations"("location_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_restaurant_locations" ADD CONSTRAINT "core_restaurant_locations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "core_entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_search_logs" ADD CONSTRAINT "user_search_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_restaurant_views" ADD CONSTRAINT "user_restaurant_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_restaurant_views" ADD CONSTRAINT "user_restaurant_views_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "core_entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "core_entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "collection_on_demand_requests_term_entity_type_reason_location_" RENAME TO "collection_on_demand_requests_term_entity_type_reason_locat_key";

-- RenameIndex
ALTER INDEX "subreddits_is_active_idx" RENAME TO "collection_subreddits_is_active_idx";

-- RenameIndex
ALTER INDEX "subreddits_last_processed_idx" RENAME TO "collection_subreddits_last_processed_idx";

-- RenameIndex
ALTER INDEX "subreddits_name_idx" RENAME TO "collection_subreddits_name_idx";

-- RenameIndex
ALTER INDEX "subreddits_name_key" RENAME TO "collection_subreddits_name_key";

-- RenameIndex
ALTER INDEX "subreddits_safe_interval_days_idx" RENAME TO "collection_subreddits_safe_interval_days_idx";

-- RenameIndex
ALTER INDEX "connections_restaurant_id_food_id_key" RENAME TO "core_connections_restaurant_id_food_id_key";

-- RenameIndex
ALTER INDEX "entities_google_place_id_key" RENAME TO "core_entities_google_place_id_key";

-- RenameIndex
ALTER INDEX "entities_primary_location_id_key" RENAME TO "core_entities_primary_location_id_key";

-- RenameIndex
ALTER INDEX "restaurant_locations_google_place_id_key" RENAME TO "core_restaurant_locations_google_place_id_key";
