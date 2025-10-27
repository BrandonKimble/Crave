UPDATE "subreddits"
SET
  "center_latitude" = 40.71541156963852::DECIMAL(10,8),
  "center_longitude" = -73.99055622940091::DECIMAL(11,8),
  "updated_at" = NOW()
WHERE "name" = 'FoodNYC';
