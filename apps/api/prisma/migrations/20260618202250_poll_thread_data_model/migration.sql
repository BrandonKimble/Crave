-- CreateEnum
CREATE TYPE "poll_origin" AS ENUM ('seeded', 'user', 'curator');

-- CreateEnum
CREATE TYPE "poll_mode" AS ENUM ('ranked', 'discussion');

-- CreateEnum
CREATE TYPE "poll_comment_moderation_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "poll_comment_extraction_status" AS ENUM ('pending', 'highlighted', 'collected');

-- CreateEnum
CREATE TYPE "poll_leaderboard_subject_type" AS ENUM ('entity', 'connection');

-- AlterTable
ALTER TABLE "polls" ADD COLUMN     "axis" JSONB,
ADD COLUMN     "mode" "poll_mode" NOT NULL DEFAULT 'ranked',
ADD COLUMN     "origin" "poll_origin" NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "poll_comments" (
    "comment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poll_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_comment_id" UUID,
    "body" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "public_id" VARCHAR(32) NOT NULL,
    "moderation_status" "poll_comment_moderation_status" NOT NULL DEFAULT 'pending',
    "extraction_status" "poll_comment_extraction_status" NOT NULL DEFAULT 'pending',
    "entity_spans" JSONB,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "poll_comments_pkey" PRIMARY KEY ("comment_id")
);

-- CreateTable
CREATE TABLE "poll_comment_likes" (
    "comment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_comment_likes_pkey" PRIMARY KEY ("comment_id","user_id")
);

-- CreateTable
CREATE TABLE "poll_leaderboard_entries" (
    "poll_id" UUID NOT NULL,
    "subject_type" "poll_leaderboard_subject_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "distinct_endorsers" INTEGER NOT NULL DEFAULT 0,
    "score" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_leaderboard_entries_pkey" PRIMARY KEY ("poll_id","subject_type","subject_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "poll_comments_public_id_key" ON "poll_comments"("public_id");

-- CreateIndex
CREATE INDEX "idx_poll_comments_poll_score" ON "poll_comments"("poll_id", "score" DESC);

-- CreateIndex
CREATE INDEX "idx_poll_comments_poll_logged" ON "poll_comments"("poll_id", "logged_at" DESC);

-- CreateIndex
CREATE INDEX "idx_poll_comments_parent" ON "poll_comments"("parent_comment_id");

-- CreateIndex
CREATE INDEX "idx_poll_comments_user" ON "poll_comments"("user_id");

-- CreateIndex
CREATE INDEX "idx_poll_comment_likes_comment" ON "poll_comment_likes"("comment_id");

-- CreateIndex
CREATE INDEX "idx_poll_comment_likes_user" ON "poll_comment_likes"("user_id");

-- CreateIndex
CREATE INDEX "idx_poll_leaderboard_poll_rank" ON "poll_leaderboard_entries"("poll_id", "rank");

-- AddForeignKey
ALTER TABLE "poll_comments" ADD CONSTRAINT "poll_comments_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("poll_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_comments" ADD CONSTRAINT "poll_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_comments" ADD CONSTRAINT "poll_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "poll_comments"("comment_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "poll_comment_likes" ADD CONSTRAINT "poll_comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "poll_comments"("comment_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_comment_likes" ADD CONSTRAINT "poll_comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_leaderboard_entries" ADD CONSTRAINT "poll_leaderboard_entries_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("poll_id") ON DELETE CASCADE ON UPDATE CASCADE;
