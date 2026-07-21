-- Legacy-poll-expiry leg: the inert notification_devices.city column dies.
-- §4 poll-push targeting is homePlaceId subtree membership (home-place
-- registration leg); nothing reads city. The DTO field stays accepted-ignored
-- until the mobile client stops sending it.
DROP INDEX IF EXISTS "idx_notification_devices_city";
ALTER TABLE "notification_devices" DROP COLUMN IF EXISTS "city";
