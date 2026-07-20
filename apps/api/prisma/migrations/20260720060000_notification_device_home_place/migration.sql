-- §4 home-place registration (geo-demand rebuild follow-up leg): devices carry
-- placeAt(home location) so poll-release targeting is subtree membership over
-- the place DAG. NULL = unknown home → the device receives no poll pushes.
ALTER TABLE "notification_devices" ADD COLUMN "home_place_id" UUID;

CREATE INDEX "idx_notification_devices_home_place_id"
  ON "notification_devices" ("home_place_id");
