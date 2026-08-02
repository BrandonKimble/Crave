-- Hot-path indexes the polls flow reads on every request (audit 2026-08-01).
-- `polls` carried only poll_id / created_by_user_id / place_id / state / topic_id,
-- so the feed's own sort and the creation gate both scanned.

-- The 'new' sort's exact access path: newest polls in a place.
CREATE INDEX IF NOT EXISTS idx_polls_place_created_at
  ON polls (place_id, created_at DESC);

-- The feed's launched-at window and the per-user listing order.
CREATE INDEX IF NOT EXISTS idx_polls_launched_at
  ON polls (launched_at DESC);

-- The "Live · N" count and every comment read: only live, approved comments
-- are ever counted, so the partial index is the whole working set.
CREATE INDEX IF NOT EXISTS idx_poll_comments_live
  ON poll_comments (poll_id)
  WHERE deleted_at IS NULL AND moderation_status = 'approved';

-- Endorsement toggles read (poll, user) on every vote.
CREATE INDEX IF NOT EXISTS idx_poll_endorsements_poll_user
  ON poll_endorsements (poll_id, user_id);

-- The safety-net sweep now selects active polls by recency.
CREATE INDEX IF NOT EXISTS idx_polls_state_updated_at
  ON polls (state, updated_at DESC);
