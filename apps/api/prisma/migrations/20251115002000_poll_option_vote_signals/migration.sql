-- Track how many votes have already contributed pseudo-signals so we only record deltas
ALTER TABLE "poll_options"
ADD COLUMN IF NOT EXISTS "aggregated_vote_count" INTEGER NOT NULL DEFAULT 0;
