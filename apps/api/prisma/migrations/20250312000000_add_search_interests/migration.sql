-- Create table to capture unresolved search interests from natural language queries
CREATE TABLE IF NOT EXISTS "search_interests" (
  "interest_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "term" VARCHAR(255) NOT NULL,
  "entity_type" "entity_type" NOT NULL,
  "occurrence_count" INTEGER NOT NULL DEFAULT 1,
  "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "search_interests_term_entity_type_key"
  ON "search_interests" ("term", "entity_type");
