-- Ranking-integrity hardening: events must reference a real photo.
DELETE FROM "photo_events" WHERE "photo_id" NOT IN (SELECT "photo_id" FROM "photos");
ALTER TABLE "photo_events"
  ADD CONSTRAINT "photo_events_photo_id_fkey"
  FOREIGN KEY ("photo_id") REFERENCES "photos"("photo_id") ON DELETE CASCADE;
