-- Curated dish items carry their Connection id as a BUILD FACT.
-- Root-cause fix (owner-ordered 2026-07-26): the mobile adapter used to
-- synthesize a `${restaurantId}:${entityId}` composite when the read-time
-- (restaurantId, foodId) resolution found no connection row. Storing the id
-- at build time (the builder's dish reads already come FROM
-- core_restaurant_items) makes that gap impossible: dish rows always carry a
-- real id, and the FK cascade removes a curated row the moment its
-- connection dies.

ALTER TABLE "curated_list_items" ADD COLUMN "connection_id" UUID;

-- Backfill existing dish rows via the same (restaurant_id, food_id) unique
-- the old read-time resolution used. Restaurant rows keep NULL.
UPDATE "curated_list_items" i
SET "connection_id" = c."connection_id"
FROM "core_restaurant_items" c
WHERE i."restaurant_id" IS NOT NULL
  AND c."restaurant_id" = i."restaurant_id"
  AND c."food_id" = i."entity_id";

-- Dish rows whose connection no longer exists cannot express hearts/saves;
-- delete them now (the FK below keeps this true forever).
DELETE FROM "curated_list_items"
WHERE "restaurant_id" IS NOT NULL AND "connection_id" IS NULL;

ALTER TABLE "curated_list_items"
  ADD CONSTRAINT "curated_list_items_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "core_restaurant_items"("connection_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "idx_curated_list_items_connection"
  ON "curated_list_items"("connection_id");
