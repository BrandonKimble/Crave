WITH target AS (
  SELECT
    'foodnyc'::TEXT AS name,
    40.730610::DECIMAL(10,8) AS center_latitude,
    -73.935242::DECIMAL(11,8) AS center_longitude
  UNION ALL
  SELECT
    'austinfood',
    30.266666::DECIMAL(10,8),
    -97.733330::DECIMAL(11,8)
)
UPDATE "subreddits" s
SET
  "center_latitude" = t.center_latitude,
  "center_longitude" = t.center_longitude,
  "updated_at" = NOW()
FROM target t
WHERE s."name" = t.name;
