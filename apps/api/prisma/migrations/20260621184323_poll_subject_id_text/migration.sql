/*
  Warnings:

  - The primary key for the `poll_endorsements` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `poll_leaderboard_entries` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "poll_endorsements" DROP CONSTRAINT "poll_endorsements_pkey",
ALTER COLUMN "subject_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "poll_endorsements_pkey" PRIMARY KEY ("poll_id", "subject_type", "subject_id", "user_id");

-- AlterTable
ALTER TABLE "poll_leaderboard_entries" DROP CONSTRAINT "poll_leaderboard_entries_pkey",
ALTER COLUMN "subject_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "poll_leaderboard_entries_pkey" PRIMARY KEY ("poll_id", "subject_type", "subject_id");
