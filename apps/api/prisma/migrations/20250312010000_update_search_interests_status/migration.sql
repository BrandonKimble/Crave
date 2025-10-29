-- Add status tracking and entity linkage to search_interests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'SearchInterestStatus'
  ) THEN
    CREATE TYPE "SearchInterestStatus" AS ENUM ('pending', 'queued', 'processing', 'completed');
  END IF;
END $$;

ALTER TABLE "search_interests"
  ADD COLUMN IF NOT EXISTS "status" "SearchInterestStatus" NOT NULL DEFAULT 'pending';

ALTER TABLE "search_interests"
  ADD COLUMN IF NOT EXISTS "entity_id" UUID;

ALTER TABLE "search_interests"
  ADD COLUMN IF NOT EXISTS "last_enqueued_at" TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'search_interests_entity_id_fkey'
      AND table_name = 'search_interests'
  ) THEN
    ALTER TABLE "search_interests"
      ADD CONSTRAINT "search_interests_entity_id_fkey"
        FOREIGN KEY ("entity_id") REFERENCES "entities"("entity_id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_search_interests_status"
  ON "search_interests" ("status");
