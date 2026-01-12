-- AlterTable
ALTER TABLE "user_search_logs" ADD COLUMN "collection_coverage_key" VARCHAR(255);

-- Backfill (v1: UI coverage as best-effort default)
UPDATE "user_search_logs"
SET "collection_coverage_key" = "location_key"
WHERE "collection_coverage_key" IS NULL;

-- CreateIndex
CREATE INDEX "idx_search_log_collection_coverage" ON "user_search_logs"("collection_coverage_key");

-- CreateIndex
CREATE INDEX "idx_search_log_entity_collection_coverage_time"
  ON "user_search_logs"("entity_id", "collection_coverage_key", "logged_at");
