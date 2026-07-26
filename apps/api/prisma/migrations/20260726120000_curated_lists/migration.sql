-- HOME SURFACE curated lists (plans/home-surface-charter.md): materialized
-- app-curated lists per live city + ranked members. No snapshot display
-- fields on items — reads join live entity/score data.

CREATE TABLE "curated_lists" (
    "list_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "city_place_id" UUID NOT NULL,
    "recipe_key" VARCHAR(128) NOT NULL,
    "scope" VARCHAR(16) NOT NULL,
    "owner_user_id" UUID,
    "list_type" VARCHAR(16) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "subtitle" VARCHAR(300),
    "icon_key" VARCHAR(64) NOT NULL,
    "rotation_key" VARCHAR(16) NOT NULL,
    "built_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "item_count" INTEGER NOT NULL,

    CONSTRAINT "curated_lists_pkey" PRIMARY KEY ("list_id")
);

CREATE TABLE "curated_list_items" (
    "list_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "entity_id" UUID NOT NULL,
    "restaurant_id" UUID,

    CONSTRAINT "curated_list_items_pkey" PRIMARY KEY ("list_id", "rank")
);

-- The identity law: one live list per (city, recipe, rotation, owner).
-- NULLS NOT DISTINCT because owner_user_id NULL = the ONE global list —
-- default Postgres NULL semantics would allow unbounded global twins.
-- (Prisma cannot express this; the schema model carries no @@unique —
-- same precedent as uq_places_identity.)
CREATE UNIQUE INDEX "uq_curated_lists_identity" ON "curated_lists"
  ("city_place_id", "recipe_key", "rotation_key", "owner_user_id")
  NULLS NOT DISTINCT;

CREATE INDEX "idx_curated_lists_city_scope" ON "curated_lists"("city_place_id", "scope");
CREATE INDEX "idx_curated_lists_owner" ON "curated_lists"("owner_user_id");
CREATE INDEX "idx_curated_list_items_entity" ON "curated_list_items"("entity_id");
CREATE INDEX "idx_curated_list_items_restaurant" ON "curated_list_items"("restaurant_id");

ALTER TABLE "curated_lists" ADD CONSTRAINT "curated_lists_city_place_id_fkey"
  FOREIGN KEY ("city_place_id") REFERENCES "places"("place_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curated_lists" ADD CONSTRAINT "curated_lists_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curated_list_items" ADD CONSTRAINT "curated_list_items_list_id_fkey"
  FOREIGN KEY ("list_id") REFERENCES "curated_lists"("list_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curated_list_items" ADD CONSTRAINT "curated_list_items_entity_id_fkey"
  FOREIGN KEY ("entity_id") REFERENCES "core_entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curated_list_items" ADD CONSTRAINT "curated_list_items_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "core_entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;
