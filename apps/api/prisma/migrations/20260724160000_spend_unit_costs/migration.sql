-- §24 COST GOVERNANCE v2, Legs A+B (plans/geo-demand-foundation-rebuild.md §24.5).
--
-- Leg A: the measured unit-cost table (§24.2) — never hand-seeded, refreshed
-- nightly by SpendAnalyticsService from api_usage_ledger joins.
--
-- Leg B: the COST mirror of the §12.4 output-collapse baseline on
-- source_collection_lanes — last tick's attributed spend, an EWMA baseline,
-- an EWMA of absolute deviation (the band width), and a pause flag flipped
-- on breach (§24.1 Tier 2).
--
-- NOT APPLIED by this session — the parent process runs the drift path
-- against prod and local DBs.

-- AlterTable
ALTER TABLE "source_collection_lanes"
  ADD COLUMN "last_cost_micros" BIGINT,
  ADD COLUMN "cost_baseline_micros" DOUBLE PRECISION,
  ADD COLUMN "cost_baseline_dev_micros" DOUBLE PRECISION,
  ADD COLUMN "cost_paused" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "spend_unit_costs" (
    "work_class" VARCHAR(64) NOT NULL,
    "unit" VARCHAR(32) NOT NULL,
    "micro_usd_per_unit" DOUBLE PRECISION NOT NULL,
    "sample_units" BIGINT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "refreshed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spend_unit_costs_pkey" PRIMARY KEY ("work_class","unit")
);
