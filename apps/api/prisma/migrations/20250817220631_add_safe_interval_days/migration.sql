/*
  Warnings:

  - Added the required column `safe_interval_days` to the `subreddits` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "subreddits" ADD COLUMN     "safe_interval_days" DOUBLE PRECISION NOT NULL DEFAULT 30.0;

-- Update existing rows with calculated safe interval based on current data
UPDATE "subreddits" SET "safe_interval_days" = GREATEST(7.0, LEAST(60.0, 750.0 / "avg_posts_per_day"));

-- Remove default after updating existing data
ALTER TABLE "subreddits" ALTER COLUMN "safe_interval_days" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "subreddits_safe_interval_days_idx" ON "subreddits"("safe_interval_days");
