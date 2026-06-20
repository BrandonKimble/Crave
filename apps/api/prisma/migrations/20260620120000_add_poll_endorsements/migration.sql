-- Direct per-candidate endorsements (the §13A public "endorse" signal applied to
-- poll leaderboard subjects). Powers tap-to-endorse on the poll bars; folded into
-- PollLeaderboardEntry.distinct_endorsers alongside comment-derived endorsers.
CREATE TABLE "poll_endorsements" (
    "poll_id" UUID NOT NULL,
    "subject_type" "poll_leaderboard_subject_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_endorsements_pkey" PRIMARY KEY ("poll_id","subject_type","subject_id","user_id")
);

CREATE INDEX "idx_poll_endorsement_subject" ON "poll_endorsements"("poll_id", "subject_type", "subject_id");

CREATE INDEX "idx_poll_endorsement_user" ON "poll_endorsements"("user_id");

ALTER TABLE "poll_endorsements" ADD CONSTRAINT "poll_endorsements_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("poll_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "poll_endorsements" ADD CONSTRAINT "poll_endorsements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
