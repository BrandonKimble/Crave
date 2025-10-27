CREATE TABLE IF NOT EXISTS "search_cooldowns" (
  "reason_key" TEXT PRIMARY KEY,
  "last_triggered_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_search_cooldowns_last_triggered"
  ON "search_cooldowns" ("last_triggered_at");

WITH upsert_values AS (
  SELECT
    'austinfood'::TEXT AS name,
    30.261308342779557::DECIMAL(10,8) AS center_latitude,
    -97.74265592343971::DECIMAL(11,8) AS center_longitude
  UNION ALL
  SELECT
    'FoodNYC',
    40.714370663366395::DECIMAL(10,8),
    -73.99879597533224::DECIMAL(11,8)
)
UPDATE "subreddits" s
SET
  "center_latitude" = u.center_latitude,
  "center_longitude" = u.center_longitude,
  "updated_at" = NOW()
FROM upsert_values u
WHERE s."name" = u.name;
