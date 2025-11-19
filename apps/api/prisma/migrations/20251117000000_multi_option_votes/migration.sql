-- Switch poll_votes primary key from (poll_id, user_id) to (option_id, user_id)
ALTER TABLE "poll_votes" DROP CONSTRAINT "poll_votes_pkey";
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("option_id", "user_id");

-- Ensure lookup indexes for poll/user combinations remain efficient
CREATE INDEX IF NOT EXISTS "idx_poll_votes_poll_user" ON "poll_votes" ("poll_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_poll_votes_poll_id" ON "poll_votes" ("poll_id");
