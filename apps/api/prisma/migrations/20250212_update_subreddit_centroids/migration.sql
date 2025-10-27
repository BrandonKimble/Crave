WITH updated_centroids AS (
  SELECT
    'austinfood'::TEXT AS name,
    30.266666::DECIMAL(10,8) AS center_latitude,
    -97.733330::DECIMAL(11,8) AS center_longitude
  UNION ALL
  SELECT
    'FoodNYC',
    40.730610::DECIMAL(10,8),
    -73.935242::DECIMAL(11,8)
)
UPDATE "subreddits" s
SET
  "center_latitude" = u.center_latitude,
  "center_longitude" = u.center_longitude,
  "updated_at" = NOW()
FROM updated_centroids u
WHERE s."name" = u.name;
