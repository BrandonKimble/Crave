-- CreateEnum
CREATE TYPE "keyword_attempt_outcome" AS ENUM ('success', 'no_results', 'error', 'deferred');

-- AlterTable
ALTER TABLE "collection_on_demand_requests"
  DROP COLUMN "attempted_subreddits",
  DROP COLUMN "deferred_attempts",
  DROP COLUMN "last_attempt_at",
  DROP COLUMN "last_completed_at",
  DROP COLUMN "last_enqueued_at",
  DROP COLUMN "last_outcome",
  DROP COLUMN "occurrence_count",
  DROP COLUMN "status",
  ADD COLUMN "distinct_user_count" INTEGER NOT NULL DEFAULT 0;

-- DropEnum
DROP TYPE "public"."OnDemandOutcome";

-- DropEnum
DROP TYPE "public"."OnDemandStatus";

-- CreateTable
CREATE TABLE "on_demand_request_users" (
  "request_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "on_demand_request_users_pkey" PRIMARY KEY ("request_id", "user_id")
);

-- CreateTable
CREATE TABLE "keyword_attempt_history" (
  "collection_coverage_key" VARCHAR(255) NOT NULL,
  "normalized_term" VARCHAR(255) NOT NULL,
  "last_attempt_at" TIMESTAMP(3),
  "last_success_at" TIMESTAMP(3),
  "last_outcome" "keyword_attempt_outcome",
  "cooldown_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "keyword_attempt_history_pkey" PRIMARY KEY ("collection_coverage_key", "normalized_term")
);

-- CreateIndex
CREATE INDEX "idx_on_demand_request_users_user_id" ON "on_demand_request_users"("user_id");

-- CreateIndex
CREATE INDEX "idx_on_demand_request_users_created_at" ON "on_demand_request_users"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_keyword_attempt_history_coverage_key" ON "keyword_attempt_history"("collection_coverage_key");

-- CreateIndex
CREATE INDEX "idx_keyword_attempt_history_cooldown_until" ON "keyword_attempt_history"("cooldown_until");

-- CreateIndex
CREATE INDEX "idx_on_demand_requests_reason" ON "collection_on_demand_requests"("reason");

-- CreateIndex
CREATE INDEX "idx_on_demand_requests_last_seen_at" ON "collection_on_demand_requests"("last_seen_at" DESC);

-- AddForeignKey
ALTER TABLE "on_demand_request_users"
  ADD CONSTRAINT "on_demand_request_users_request_id_fkey"
  FOREIGN KEY ("request_id")
  REFERENCES "collection_on_demand_requests"("request_id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_demand_request_users"
  ADD CONSTRAINT "on_demand_request_users_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("user_id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

