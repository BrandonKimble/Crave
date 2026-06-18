/*
  Warnings:

  - You are about to drop the `poll_category_aggregates` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "public"."idx_entities_name_embedding_hnsw";

-- DropTable
DROP TABLE "public"."poll_category_aggregates";
