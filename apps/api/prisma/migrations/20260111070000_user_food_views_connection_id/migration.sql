-- DropTable
DROP TABLE "user_food_views";

-- CreateTable
CREATE TABLE "user_food_views" (
  "user_id" UUID NOT NULL,
  "connection_id" UUID NOT NULL,
  "food_id" UUID NOT NULL,
  "last_viewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "view_count" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT "user_food_views_pkey" PRIMARY KEY ("user_id", "connection_id")
);

-- CreateIndex
CREATE INDEX "idx_food_views_user_time"
  ON "user_food_views"("user_id", "last_viewed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_food_views_food" ON "user_food_views"("food_id");

-- CreateIndex
CREATE INDEX "idx_food_views_connection" ON "user_food_views"("connection_id");

-- AddForeignKey
ALTER TABLE "user_food_views"
  ADD CONSTRAINT "user_food_views_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_food_views"
  ADD CONSTRAINT "user_food_views_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "core_connections"("connection_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_food_views"
  ADD CONSTRAINT "user_food_views_food_id_fkey"
  FOREIGN KEY ("food_id") REFERENCES "core_entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;
