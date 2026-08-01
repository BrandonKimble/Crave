-- USER-LAYER LAW (2026-08-01 red team R1): user rows must never be destroyed
-- by derived-layer cleanup. Cascade on user_list_items/photos → entities/
-- connections meant a projection rebuild or GC could silently delete a
-- user's saved item (note and all) or photo. RESTRICT forces every deleter
-- through an anchor-aware path (merge/rehome repoints BEFORE delete).

ALTER TABLE "user_list_items"
  DROP CONSTRAINT "user_list_items_restaurant_id_fkey",
  ADD CONSTRAINT "user_list_items_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "core_entities"("entity_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_list_items"
  DROP CONSTRAINT "user_list_items_connection_id_fkey",
  ADD CONSTRAINT "user_list_items_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "core_restaurant_items"("connection_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "photos"
  DROP CONSTRAINT "photos_restaurant_id_fkey",
  ADD CONSTRAINT "photos_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "core_entities"("entity_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "photos"
  DROP CONSTRAINT "photos_connection_id_fkey",
  ADD CONSTRAINT "photos_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "core_restaurant_items"("connection_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
