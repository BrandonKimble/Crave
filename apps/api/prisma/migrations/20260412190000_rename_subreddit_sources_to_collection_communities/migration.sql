ALTER TABLE "reddit_subreddit_sources"
  RENAME TO "collection_communities";

ALTER TABLE "collection_communities"
  RENAME COLUMN "subreddit_source_id" TO "collection_community_id";

ALTER TABLE "collection_communities"
  RENAME COLUMN "subreddit_name" TO "community_name";

ALTER TABLE "markets"
  RENAME COLUMN "source_subreddit" TO "source_community";

ALTER INDEX "reddit_subreddit_sources_pkey"
  RENAME TO "collection_communities_pkey";

ALTER INDEX "reddit_subreddit_sources_subreddit_name_key"
  RENAME TO "collection_communities_community_name_key";

ALTER INDEX "reddit_subreddit_sources_subreddit_name_idx"
  RENAME TO "collection_communities_community_name_idx";

ALTER INDEX "idx_reddit_subreddit_sources_market_key"
  RENAME TO "idx_collection_communities_market_key";

ALTER INDEX "idx_reddit_subreddit_sources_active"
  RENAME TO "idx_collection_communities_active";

ALTER INDEX "idx_reddit_subreddit_sources_last_processed"
  RENAME TO "idx_collection_communities_last_processed";

ALTER INDEX "idx_reddit_subreddit_sources_safe_interval"
  RENAME TO "idx_collection_communities_safe_interval";

ALTER INDEX "idx_markets_source_subreddit"
  RENAME TO "idx_markets_source_community";
