-- Owner decision: list-item tags are dead (UI never shipped). Note stays.
ALTER TABLE "favorite_list_items" DROP COLUMN IF EXISTS "tags";
