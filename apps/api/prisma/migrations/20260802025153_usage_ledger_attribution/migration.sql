-- Honest cost attribution (round-six ideal shape): which campaign paid, and why.
ALTER TABLE "api_usage_ledger" ADD COLUMN "campaign_id" UUID;
ALTER TABLE "api_usage_ledger" ADD COLUMN "attribution" VARCHAR(64);
CREATE INDEX "idx_api_usage_campaign" ON "api_usage_ledger"("campaign_id");
