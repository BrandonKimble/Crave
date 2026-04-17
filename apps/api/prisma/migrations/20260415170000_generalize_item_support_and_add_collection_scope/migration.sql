ALTER TABLE "core_restaurant_items"
RENAME COLUMN "category_support_mention_count" TO "support_mention_count";

ALTER TABLE "core_restaurant_items"
RENAME COLUMN "category_support_total_upvotes" TO "support_total_upvotes";

ALTER TABLE "core_restaurant_items"
RENAME COLUMN "category_support_recent_mention_count" TO "support_recent_mention_count";

ALTER TABLE "core_restaurant_items"
RENAME COLUMN "category_support_decayed_mention_score" TO "support_decayed_mention_score";

ALTER TABLE "core_restaurant_items"
RENAME COLUMN "category_support_decayed_upvote_score" TO "support_decayed_upvote_score";

ALTER TABLE "collection_extraction_runs"
ADD COLUMN "collection_scope_key" VARCHAR(255);

CREATE INDEX "idx_extraction_runs_collection_scope_key"
ON "collection_extraction_runs" ("collection_scope_key");
