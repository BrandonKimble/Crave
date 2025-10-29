-- Transform legacy search_interests records into unified on_demand requests

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'OnDemandReason'
  ) THEN
    CREATE TYPE "OnDemandReason" AS ENUM ('low_result', 'unresolved');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'SearchInterestStatus'
  ) THEN
    ALTER TYPE "SearchInterestStatus" RENAME TO "OnDemandStatus";
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'OnDemandStatus'
  ) THEN
    CREATE TYPE "OnDemandStatus" AS ENUM ('pending', 'queued', 'processing', 'completed');
  END IF;
END $$;

ALTER TABLE "search_interests" RENAME TO "on_demand";

ALTER TABLE "on_demand" RENAME COLUMN "interest_id" TO "request_id";

ALTER TABLE "on_demand"
  ADD COLUMN IF NOT EXISTS "reason" "OnDemandReason";

UPDATE "on_demand"
SET "reason" = 'unresolved'
WHERE "reason" IS NULL;

ALTER TABLE "on_demand"
  ALTER COLUMN "reason" SET NOT NULL,
  ALTER COLUMN "reason" SET DEFAULT 'unresolved';

ALTER TABLE "on_demand"
  ALTER COLUMN "status" TYPE "OnDemandStatus" USING "status"::TEXT::"OnDemandStatus",
  ALTER COLUMN "status" SET DEFAULT 'pending';

DROP INDEX IF EXISTS "search_interests_term_entity_type_key";
DROP INDEX IF EXISTS "on_demand_term_entity_type_key";

CREATE UNIQUE INDEX IF NOT EXISTS "on_demand_term_entity_type_reason_key"
  ON "on_demand" ("term", "entity_type", "reason");

ALTER INDEX IF EXISTS "idx_search_interests_status" RENAME TO "idx_on_demand_status";

CREATE INDEX IF NOT EXISTS "idx_on_demand_reason"
  ON "on_demand" ("reason");

CREATE INDEX IF NOT EXISTS "idx_on_demand_entity"
  ON "on_demand" ("entity_id");
