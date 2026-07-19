-- Location-centric interaction (master plan §7): favorites save the SPECIFIC
-- location. Nullable (legacy rows degrade to nearest-in-view); save flows
-- always supply it going forward.
ALTER TABLE "user_favorites" ADD COLUMN "location_id" UUID NULL REFERENCES "core_restaurant_locations"("location_id") ON DELETE SET NULL;
ALTER TABLE "favorite_list_items" ADD COLUMN "location_id" UUID NULL REFERENCES "core_restaurant_locations"("location_id") ON DELETE SET NULL;
