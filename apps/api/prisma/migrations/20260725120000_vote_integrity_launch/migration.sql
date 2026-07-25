-- Vote-integrity launch rungs (plans/vote-integrity-ladder.md):
-- 1) user_devices — the (user, device-key) observation join table written
--    fire-and-forget from the auth-guard sync seam. "Device has N accounts"
--    is a GROUP BY over this table.
--    NOTE: bare uuid user_id, no FK — the drifted dev users table carries no
--    PK/unique constraint to reference (NotificationDevice.homePlaceId
--    precedent: a dangling id simply matches nothing).
-- 2) signal_actors.excluded_at — the pre-built ban flag for confirmed sybil
--    rings. NO read-side filtering yet; that lands with the first ring.

CREATE TABLE "user_devices" (
    "user_id" UUID NOT NULL,
    "device_key" VARCHAR(64) NOT NULL,
    "first_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "last_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("user_id", "device_key")
);

CREATE INDEX "idx_user_devices_device_key" ON "user_devices"("device_key");

ALTER TABLE "signal_actors" ADD COLUMN "excluded_at" TIMESTAMPTZ(6);
