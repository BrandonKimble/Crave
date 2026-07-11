-- The last user_stats counter column: replaced by a live COUNT(DISTINCT poll_id)
-- over poll_endorsements ∪ poll_comments at profile-read time (no-drift law).
ALTER TABLE "user_stats" DROP COLUMN "polls_contributed_count";
