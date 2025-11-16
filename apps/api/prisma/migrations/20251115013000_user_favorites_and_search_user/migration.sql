CREATE TABLE IF NOT EXISTS "user_favorites" (
  "favorite_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "entity_id" UUID NOT NULL,
  "entity_type" "entity_type" NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "user_favorites"
  ADD CONSTRAINT "user_favorites_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE,
  ADD CONSTRAINT "user_favorites_entity_id_fkey"
    FOREIGN KEY ("entity_id") REFERENCES "entities"("entity_id") ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "user_favorites_user_entity_unique"
  ON "user_favorites" ("user_id", "entity_id");

CREATE INDEX IF NOT EXISTS "idx_user_favorites_user"
  ON "user_favorites" ("user_id");

ALTER TABLE "search_log"
  ADD COLUMN IF NOT EXISTS "user_id" UUID;

ALTER TABLE "search_log"
  ADD CONSTRAINT "search_log_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_search_log_user_id"
  ON "search_log" ("user_id");
