-- AlterTable
ALTER TABLE "collection_subreddits" ADD COLUMN "coverage_key" VARCHAR(100);

-- CreateIndex
CREATE INDEX "idx_collection_subreddits_coverage_key" ON "collection_subreddits"("coverage_key");
