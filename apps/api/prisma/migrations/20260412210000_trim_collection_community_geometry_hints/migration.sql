ALTER TABLE "collection_communities"
  DROP COLUMN IF EXISTS "display_name",
  DROP COLUMN IF EXISTS "center_latitude",
  DROP COLUMN IF EXISTS "center_longitude",
  DROP COLUMN IF EXISTS "viewport_ne_latitude",
  DROP COLUMN IF EXISTS "viewport_ne_longitude",
  DROP COLUMN IF EXISTS "viewport_sw_latitude",
  DROP COLUMN IF EXISTS "viewport_sw_longitude";
