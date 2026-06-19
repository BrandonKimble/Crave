/*
  Warnings:

  - You are about to drop the `poll_metrics` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `poll_options` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `poll_votes` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."poll_metrics" DROP CONSTRAINT "poll_metrics_poll_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."poll_options" DROP CONSTRAINT "poll_options_category_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."poll_options" DROP CONSTRAINT "poll_options_connection_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."poll_options" DROP CONSTRAINT "poll_options_entity_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."poll_options" DROP CONSTRAINT "poll_options_food_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."poll_options" DROP CONSTRAINT "poll_options_poll_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."poll_options" DROP CONSTRAINT "poll_options_restaurant_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."poll_votes" DROP CONSTRAINT "poll_votes_option_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."poll_votes" DROP CONSTRAINT "poll_votes_poll_id_fkey";

-- DropTable
DROP TABLE "public"."poll_metrics";

-- DropTable
DROP TABLE "public"."poll_options";

-- DropTable
DROP TABLE "public"."poll_votes";

-- DropEnum
DROP TYPE "public"."poll_option_resolution_status";

-- DropEnum
DROP TYPE "public"."poll_option_source";
