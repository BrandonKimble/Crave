-- UGC photo ledger + batched photo events (plans/images-ideal-shape.md).
CREATE TYPE "PhotoStatus" AS ENUM ('pending', 'live', 'hidden', 'removed');

CREATE TABLE "photos" (
  "photo_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "restaurant_id" UUID NOT NULL,
  "connection_id" UUID,
  "public_id" VARCHAR(256) NOT NULL,
  "media_type" VARCHAR(16) NOT NULL DEFAULT 'photo',
  "status" "PhotoStatus" NOT NULL DEFAULT 'pending',
  "caption" VARCHAR(512),
  "taken_at" TIMESTAMP(3),
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "focus_score" DOUBLE PRECISION,
  "width" INTEGER,
  "height" INTEGER,
  "bytes" INTEGER,
  "report_count" INTEGER NOT NULL DEFAULT 0,
  "pending_dish_name" VARCHAR(256),
  "moderated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "photos_pkey" PRIMARY KEY ("photo_id"),
  CONSTRAINT "photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE,
  CONSTRAINT "photos_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "core_entities"("entity_id") ON DELETE CASCADE,
  CONSTRAINT "photos_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "core_restaurant_items"("connection_id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "photos_public_id_key" ON "photos"("public_id");
CREATE INDEX "idx_photos_restaurant_status" ON "photos"("restaurant_id", "status", "uploaded_at" DESC);
CREATE INDEX "idx_photos_connection_status" ON "photos"("connection_id", "status", "uploaded_at" DESC);
CREATE INDEX "idx_photos_user_status" ON "photos"("user_id", "status", "uploaded_at" DESC);
CREATE INDEX "idx_photos_status" ON "photos"("status");

CREATE TABLE "photo_events" (
  "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "photo_id" UUID NOT NULL,
  "user_id" UUID,
  "event_type" VARCHAR(16) NOT NULL,
  "event_count" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "photo_events_pkey" PRIMARY KEY ("event_id")
);
CREATE INDEX "idx_photo_events_photo_type" ON "photo_events"("photo_id", "event_type");
CREATE INDEX "idx_photo_events_created" ON "photo_events"("created_at" DESC);
