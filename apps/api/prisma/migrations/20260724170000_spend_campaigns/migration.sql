-- §24 COST GOVERNANCE v2, Leg C (plans/geo-demand-foundation-rebuild.md §24.5):
-- the campaign surface (Tier 1, §24.1/§24.3) — one row per named, finite,
-- spend-bearing job. estimate_hash binds an approval to EXACTLY the
-- estimate it approved; the §14.6 grant pool `campaign.<campaignId>` is the
-- campaign's spend identity (grant amount = estimate x (1 + tolerance), the
-- projection envelope's upper bound — grant exhaustion IS the envelope
-- breach stop, by construction; see SpendCampaignService.approve).
--
-- micro_usd_per_unit / estimate_micros / tolerance_fraction / estimate_hash
-- are NULLABLE: a bounded pilot campaign (§24.2 cold-start law) is created
-- directly in 'approved' state with no dollar estimate at all — its budget
-- is its unit COUNT, priced post-hoc once the pilot's actuals publish a
-- rate. A non-pilot campaign always has these four populated together
-- (prepareEstimate sets all four atomically).
--
-- NOT APPLIED by this session (§16 constants-constitution work: migration
-- FILE only, no `prisma migrate` run) — the parent process/owner applies it.

-- CreateTable
CREATE TABLE "spend_campaigns" (
    "campaign_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(128) NOT NULL,
    "work_class" VARCHAR(64) NOT NULL,
    "unit" VARCHAR(32) NOT NULL,
    "unit_count" INTEGER NOT NULL,
    "micro_usd_per_unit" DOUBLE PRECISION,
    "estimate_micros" BIGINT,
    "tolerance_fraction" DOUBLE PRECISION,
    "estimate_hash" VARCHAR(64),
    "state" VARCHAR(24) NOT NULL DEFAULT 'draft',
    "spent_micros" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "breach_note" TEXT,

    CONSTRAINT "spend_campaigns_pkey" PRIMARY KEY ("campaign_id")
);

-- Index: the approval surface + operator scripts read by state + work class
-- ("what's awaiting approval / running for this work class").
CREATE INDEX "idx_spend_campaigns_state_work_class" ON "spend_campaigns"("state", "work_class");
