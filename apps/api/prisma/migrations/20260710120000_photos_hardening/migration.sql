-- Photos foundation hardening (ideal-shape review 2026-07-10):
-- per-user report identity, typed photo events, dish re-link index.
CREATE TABLE "photo_reports" (
  "report_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "photo_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "photo_reports_pkey" PRIMARY KEY ("report_id"),
  CONSTRAINT "photo_reports_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("photo_id") ON DELETE CASCADE,
  CONSTRAINT "photo_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE
);
-- ONE report per user per photo — the dedup IS the schema.
CREATE UNIQUE INDEX "photo_reports_photo_user_key" ON "photo_reports"("photo_id", "user_id");

CREATE TYPE "PhotoEventType" AS ENUM ('impression', 'tap');
ALTER TABLE "photo_events"
  ALTER COLUMN "event_type" TYPE "PhotoEventType" USING "event_type"::"PhotoEventType";

-- Find "photos awaiting dish X" when the dish materializes.
CREATE INDEX "idx_photos_pending_dish" ON "photos"("restaurant_id", "pending_dish_name")
  WHERE "pending_dish_name" IS NOT NULL AND "connection_id" IS NULL;
