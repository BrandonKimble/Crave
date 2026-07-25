-- §18.4/§24.3 OWNER OPS DASHBOARD + ALERT INFRASTRUCTURE
-- (plans/geo-demand-foundation-rebuild.md §24). One row per emitted alert;
-- dedupe_key (nullable UNIQUE) is the alert-storm collapse — repeat
-- emissions for the SAME underlying condition (a campaign breach, a
-- monthly vendor-cap hit, a lane pause) reuse the same dedupe key so
-- OpsAlertsService's createMany({skipDuplicates:true}) is a no-op on
-- repeats instead of paging the owner every tick.
--
-- NOT APPLIED by this session (§16 constants-constitution work: migration
-- FILE only, no `prisma migrate` run) — the parent process/owner applies it.

-- CreateTable
CREATE TABLE "ops_alerts" (
    "alert_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "severity" VARCHAR(16) NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "dedupe_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "acknowledged_at" TIMESTAMPTZ,

    CONSTRAINT "ops_alerts_pkey" PRIMARY KEY ("alert_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ops_alerts_dedupe_key_key" ON "ops_alerts"("dedupe_key");

-- Index: the dashboard's "latest N" + unacknowledged-count reads.
CREATE INDEX "idx_ops_alerts_created_at" ON "ops_alerts"("created_at" DESC);
