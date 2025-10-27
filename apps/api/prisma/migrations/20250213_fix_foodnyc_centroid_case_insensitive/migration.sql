WITH target AS (
  SELECT
    'FoodNYC'::TEXT AS name,
    40.730610::DECIMAL(10,8) AS center_latitude,
    -73.935242::DECIMAL(11,8) AS center_longitude
)
UPDATE "subreddits" s
SET
  "center_latitude" = t.center_latitude,
  "center_longitude" = t.center_longitude,
  "updated_at" = NOW()
FROM target t
WHERE lower(s."name") = lower(t.name);
