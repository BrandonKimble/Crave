-- F7502: the in-app notification feed pages by created_at DESC alone, which is
-- non-unique (Timestamptz(3)). Ties are ordered however the plan returns, so a
-- row sharing a millisecond with another can land on two pages or none. The
-- feed query now orders by (created_at DESC, user_notification_id DESC); this
-- extends the covering index to carry the tiebreak so it is free.
--
-- Plain CREATE INDEX on a small table — deliberately NOT flagged by the
-- parallel-worker gate (check-migration-parallel-guard.mjs), and no table
-- rewrite, so no GUC guard is required.
DROP INDEX IF EXISTS "idx_user_notifications_user_created";
CREATE INDEX "idx_user_notifications_user_created"
  ON "user_notifications" ("user_id", "created_at" DESC, "user_notification_id" DESC);
