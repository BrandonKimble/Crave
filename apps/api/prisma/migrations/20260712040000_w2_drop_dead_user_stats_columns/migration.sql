-- W2 cleanup: profile stats are LIVE counts at read time (UserService.buildProfileStats);
-- these increment-counter columns had zero readers and drifted. pollsContributedCount
-- stays (the one remaining user_stats read).
ALTER TABLE "user_stats"
  DROP COLUMN "polls_created_count",
  DROP COLUMN "followers_count",
  DROP COLUMN "following_count",
  DROP COLUMN "favorite_lists_count",
  DROP COLUMN "favorites_total_count";
