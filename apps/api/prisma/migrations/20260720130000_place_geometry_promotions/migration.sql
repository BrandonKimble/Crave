-- §2 Tier-2 polygon promotion queue (plans/geo-demand-foundation-rebuild.md
-- §2 "earned moments"): one row per place that has EARNED a scarce-pool
-- polygon. place_id is the PK — enqueue is idempotent by construction
-- (already queued OR already promoted = ON CONFLICT no-op).
--
--   trigger              open vocabulary (§1 open-code stance — stored,
--                        never switched on): poll_created | source_attached |
--                        credit_prefetch | header_answers | ...
--   attempts             draw-consuming tries that did NOT yield a polygon
--                        (vendor miss / bad geometry id). No cap — the
--                        scarce pool bounds spend, not an invented number.
--   last_attempt_at      gates retry to the NEXT month window (the K4
--                        monthly pool IS the backoff clock — no invented
--                        backoff constant).
--   provider_boundary_id caches a cheap-pool-resolved TomTom geometry id
--                        across windows so a scarce denial never re-spends
--                        the cheap forward geocode.
CREATE TABLE "place_geometry_promotions" (
  "place_id" UUID NOT NULL,
  "trigger" VARCHAR(32) NOT NULL,
  "enqueued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "promoted_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_attempt_at" TIMESTAMP(3),
  "provider_boundary_id" VARCHAR(128),
  CONSTRAINT "place_geometry_promotions_pkey" PRIMARY KEY ("place_id")
);

-- Drain read: queued (promoted_at IS NULL) oldest-first.
CREATE INDEX "idx_place_geometry_promotions_drain"
  ON "place_geometry_promotions"("promoted_at", "enqueued_at");
