ALTER TABLE "collection_subreddits"
  ALTER COLUMN "avg_posts_per_day" DROP NOT NULL,
  ALTER COLUMN "safe_interval_days" DROP NOT NULL,
  ALTER COLUMN "last_calculated" DROP NOT NULL;
