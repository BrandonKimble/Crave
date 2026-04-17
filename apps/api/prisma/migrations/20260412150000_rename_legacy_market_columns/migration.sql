ALTER TABLE "core_display_rank_scores"
  RENAME COLUMN "location_key" TO "market_key";

ALTER INDEX "idx_display_rank_location_type"
  RENAME TO "idx_display_rank_market_type";

ALTER TABLE "poll_topics"
  RENAME COLUMN "coverage_key" TO "market_key";

ALTER INDEX "idx_poll_topics_coverage_key"
  RENAME TO "idx_poll_topics_market_key";

ALTER TABLE "polls"
  RENAME COLUMN "coverage_key" TO "market_key";

ALTER INDEX "idx_polls_coverage_key"
  RENAME TO "idx_polls_market_key";

ALTER TABLE "user_search_logs"
  RENAME COLUMN "location_key" TO "market_key";

ALTER TABLE "user_search_logs"
  RENAME COLUMN "collection_coverage_key" TO "collectable_market_key";

ALTER TABLE "user_search_logs"
  RENAME COLUMN "coverage_status" TO "market_status";

ALTER INDEX "idx_search_log_location"
  RENAME TO "idx_search_log_market";

ALTER INDEX "idx_search_log_collection_coverage"
  RENAME TO "idx_search_log_collectable_market";

ALTER INDEX "idx_search_log_entity_location_time"
  RENAME TO "idx_search_log_entity_market_time";

ALTER INDEX "idx_search_log_entity_collection_coverage_time"
  RENAME TO "idx_search_log_entity_collectable_market_time";

ALTER TABLE "collection_on_demand_requests"
  RENAME COLUMN "location_key" TO "market_key";

ALTER INDEX "collection_on_demand_requests_term_entity_type_reason_locat_key"
  RENAME TO "collection_on_demand_requests_term_entity_type_reason_market_key";

ALTER TABLE "keyword_attempt_history"
  RENAME COLUMN "collection_coverage_key" TO "collectable_market_key";

ALTER INDEX "idx_keyword_attempt_history_coverage_key"
  RENAME TO "idx_keyword_attempt_history_collectable_market_key";
