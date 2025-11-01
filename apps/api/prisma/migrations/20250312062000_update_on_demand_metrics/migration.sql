-- Alter on_demand tracking columns and add outcome enum

CREATE TYPE "OnDemandOutcome" AS ENUM (
  'success',
  'no_results',
  'error',
  'deferred',
  'no_active_subreddits'
);

ALTER TABLE "on_demand"
  ADD COLUMN "result_restaurant_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "result_food_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "attempted_subreddits" TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN "deferred_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_outcome" "OnDemandOutcome",
  ADD COLUMN "last_attempt_at" TIMESTAMPTZ,
  ADD COLUMN "last_completed_at" TIMESTAMPTZ;
