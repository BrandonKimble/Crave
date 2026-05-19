ALTER TABLE "collection_on_demand_ask_events"
  ADD COLUMN IF NOT EXISTS "collectable_market_key" VARCHAR(255);

UPDATE "collection_on_demand_ask_events" e
SET "collectable_market_key" = LOWER(TRIM(e."market_key"))
WHERE e."collectable_market_key" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "collection_communities" cc
    JOIN "core_markets" m
      ON LOWER(TRIM(m."market_key")) = LOWER(TRIM(cc."market_key"))
    WHERE cc."is_active" = true
      AND cc."market_key" IS NOT NULL
      AND m."is_active" = true
      AND m."is_collectable" = true
      AND LOWER(TRIM(cc."market_key")) = LOWER(TRIM(e."market_key"))
  );

CREATE INDEX IF NOT EXISTS "idx_on_demand_ask_events_collectable_market_time"
  ON "collection_on_demand_ask_events"("collectable_market_key", "asked_at" DESC);
