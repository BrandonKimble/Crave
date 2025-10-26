ALTER TABLE "subreddits"
  ADD COLUMN IF NOT EXISTS "center_latitude" DECIMAL(10,8),
  ADD COLUMN IF NOT EXISTS "center_longitude" DECIMAL(11,8);
