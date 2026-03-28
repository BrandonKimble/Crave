CREATE TYPE "onboarding_status" AS ENUM ('not_started', 'in_progress', 'completed');

ALTER TABLE "users"
  ADD COLUMN "onboarding_status" "onboarding_status" NOT NULL DEFAULT 'not_started',
  ADD COLUMN "onboarding_completed_at" timestamp(3),
  ADD COLUMN "onboarding_version" integer NOT NULL DEFAULT 1,
  ADD COLUMN "onboarding_selected_city" varchar(255),
  ADD COLUMN "onboarding_preview_city" varchar(255),
  ADD COLUMN "onboarding_responses" jsonb;

CREATE INDEX "idx_users_onboarding_status" ON "users"("onboarding_status");
