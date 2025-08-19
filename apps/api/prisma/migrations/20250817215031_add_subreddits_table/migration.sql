-- DropIndex
DROP INDEX "idx_entities_aliases_gin";

-- DropIndex
DROP INDEX "idx_entities_name_gin";

-- CreateTable
CREATE TABLE "subreddits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "avg_posts_per_day" DOUBLE PRECISION NOT NULL,
    "last_calculated" TIMESTAMPTZ(6) NOT NULL,
    "last_processed" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subreddits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subreddits_name_key" ON "subreddits"("name");

-- CreateIndex
CREATE INDEX "subreddits_name_idx" ON "subreddits"("name");

-- CreateIndex
CREATE INDEX "subreddits_is_active_idx" ON "subreddits"("is_active");

-- CreateIndex
CREATE INDEX "subreddits_last_processed_idx" ON "subreddits"("last_processed");

-- CreateIndex
CREATE INDEX "idx_entities_name" ON "entities"("name");

-- CreateIndex
CREATE INDEX "idx_entities_aliases" ON "entities"("aliases");

-- CreateIndex
CREATE INDEX "idx_entities_restaurant_attributes" ON "entities"("restaurant_attributes");

-- CreateIndex
CREATE INDEX "idx_entities_address" ON "entities"("address");
