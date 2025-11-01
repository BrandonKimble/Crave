ALTER TABLE "connections"
  DROP CONSTRAINT IF EXISTS "connections_restaurant_id_food_id_food_attribut_key";

-- Remove duplicate rows so the new uniqueness can be enforced
WITH ranked AS (
  SELECT
    connection_id,
    ROW_NUMBER() OVER (
      PARTITION BY restaurant_id, food_id
      ORDER BY created_at DESC, connection_id
    ) AS row_num
  FROM "connections"
)
DELETE FROM "connections" c
USING ranked r
WHERE c.connection_id = r.connection_id
  AND r.row_num > 1;

ALTER TABLE "connections"
  ADD CONSTRAINT "connections_restaurant_id_food_id_key"
    UNIQUE ("restaurant_id", "food_id");
