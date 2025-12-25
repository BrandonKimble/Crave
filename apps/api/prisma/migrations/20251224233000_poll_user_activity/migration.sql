-- Poll user tracking fields + indexes.
ALTER TABLE "poll_topics"
  ADD COLUMN "created_by_user_id" uuid;

ALTER TABLE "polls"
  ADD COLUMN "created_by_user_id" uuid;

CREATE INDEX "idx_poll_topics_created_by_user"
  ON "poll_topics" ("created_by_user_id");

CREATE INDEX "idx_polls_created_by_user"
  ON "polls" ("created_by_user_id");

CREATE INDEX "idx_poll_options_added_by_user"
  ON "poll_options" ("added_by_user_id");

CREATE INDEX "idx_poll_votes_user_id"
  ON "poll_votes" ("user_id");
