-- Add decayed score tracking to connections for incremental exponential decay
ALTER TABLE "connections"
  ADD COLUMN "decayed_mention_score" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "decayed_upvote_score" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "decayed_scores_updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
