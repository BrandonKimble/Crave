ALTER TABLE "core_coverage_areas" RENAME TO "reddit_subreddit_sources";

ALTER TABLE "reddit_subreddit_sources"
  RENAME CONSTRAINT "coverage_areas_pkey" TO "reddit_subreddit_sources_pkey";

ALTER TABLE "reddit_subreddit_sources"
  RENAME COLUMN "id" TO "subreddit_source_id";

ALTER TABLE "reddit_subreddit_sources"
  RENAME COLUMN "name" TO "subreddit_name";

ALTER TABLE "reddit_subreddit_sources"
  RENAME COLUMN "coverage_key" TO "market_key";

ALTER TABLE "reddit_subreddit_sources"
  DROP COLUMN IF EXISTS "source_type";

ALTER INDEX "coverage_areas_name_key"
  RENAME TO "reddit_subreddit_sources_subreddit_name_key";

ALTER INDEX "coverage_areas_name_idx"
  RENAME TO "reddit_subreddit_sources_subreddit_name_idx";

ALTER INDEX "idx_coverage_areas_coverage_key"
  RENAME TO "idx_reddit_subreddit_sources_market_key";

ALTER INDEX "idx_coverage_areas_active"
  RENAME TO "idx_reddit_subreddit_sources_active";

ALTER INDEX "idx_coverage_areas_last_processed"
  RENAME TO "idx_reddit_subreddit_sources_last_processed";

ALTER INDEX "idx_coverage_areas_safe_interval"
  RENAME TO "idx_reddit_subreddit_sources_safe_interval";

DROP TYPE IF EXISTS "coverage_source_type";
