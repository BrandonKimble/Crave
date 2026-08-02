-- A REAL attempt counter for the janitor's archive/retry policy.
--
-- The policy read `restaurant_metadata->'lastEnrichmentAttempt'->>'count'`,
-- whose only writer set it to `ranked.length` — the number of Google
-- CANDIDATES returned, not attempts. Two live consequences: a restaurant was
-- archived because Google returned the MOST evidence for it, and every
-- `error`-status attempt (which writes no count) stayed permanently at 0 and
-- was re-enriched every week forever at real Places spend.
ALTER TABLE "core_entities"
  ADD COLUMN IF NOT EXISTS "enrichment_failure_count" INTEGER NOT NULL DEFAULT 0;

-- Seed from the existing blob ONLY where it is a plausible attempt count.
-- The old value conflates candidates with attempts, so anything above the
-- archive threshold is not trustworthy evidence of repeated failure — those
-- start at 0 and earn their count honestly rather than being archived on a
-- number that never meant what the policy thought.
UPDATE "core_entities"
SET "enrichment_failure_count" = 0
WHERE "restaurant_metadata" IS NOT NULL;

-- The janitor scans active restaurants with no grounded location.
CREATE INDEX IF NOT EXISTS "idx_core_entities_enrichment_failure_count"
  ON "core_entities" ("type", "status", "enrichment_failure_count");
