-- THE GRACE PERIOD, MADE REAL.
--
-- `deleted_at` was stamped and nothing ever read it as a deadline: no purge,
-- no restore path. A documented "30-day grace, then hard purge" with no
-- mechanism is a WORSE legal position than no promise, because it is a
-- commitment you are provably not keeping.
--
-- Two columns, because "hidden" and "physically gone" are different facts and
-- conflating them is exactly how a restore window silently becomes a
-- retention violation:
--   deleted_at    - LOGICAL erasure. Set at confirm, alongside session
--                   revocation, push-token deletion and authorship severance,
--                   all of which are already irreversible and correctly so.
--                   From every reader's point of view the account is gone now.
--   purge_due_at  - the deadline the purge cron acts on. Nothing else reads it.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "purge_due_at" TIMESTAMPTZ;

-- Partial index: the purge sweep asks one question ("who is due?") over a set
-- that is almost always empty, so it must never scan the table.
CREATE INDEX IF NOT EXISTS idx_users_purge_due
  ON "users" ("purge_due_at")
  WHERE "purge_due_at" IS NOT NULL;

COMMENT ON COLUMN "users"."purge_due_at" IS
  'When the 30-day grace expires and the shell is hard-purged. Set with deleted_at; read only by the purge cron.';
