-- THE VENDOR GEOMETRY ID IS THE IDENTITY — put it where identity lives.
--
-- P3 (2026-07-26) made the stable TomTom geometry id the identity key, but
-- the id was only ever stored on place_geometries.provider_boundary_id. The
-- places row still carried its CENSUS GEOID ('4880032') in provider_place_id,
-- so the id-first identity lookup matched only the 54 tomtom-provider rows —
-- P3 was inert for 99.7% of the catalog and every observation fell back to
-- the name matching P3 exists to replace.
--
-- Backfilling identity onto the place does three things at once:
--   1. makes P3 real for the whole catalog;
--   2. lets the promotion drain skip its resolve step (it already reads
--      provider='tomtom' ? providerPlaceId : null);
--   3. RETIRES THE CENSUS GEOID — census's last runtime role. It was always a
--      one-time bootstrap answering "what US places exist?", a question the
--      vendor has no endpoint for. That job is done; TomTom identity replaces
--      it. Nothing in the serving path reads census data.
--
-- SAFETY, verified on prod immediately before writing this:
--   - 0 geometry ids are shared by more than one place (the shared-polygon
--     repair + the write-time exclusivity guard established that invariant);
--   - 0 backfilled ids would collide with an existing provider_place_id.
-- The unique index below turns that invariant from "true today" into
-- "enforced forever".

UPDATE "places" p
SET "provider" = 'tomtom',
    "provider_place_id" = pg."provider_boundary_id"
FROM "place_geometries" pg
WHERE pg."place_id" = p."place_id"
  AND pg."provider_boundary_id" IS NOT NULL
  AND p."provider_place_id" IS DISTINCT FROM pg."provider_boundary_id";

-- Identity must be unique to BE identity. Partial: a place with no vendor id
-- yet (sketch-grade, or a place the vendor does not model) is not a conflict.
CREATE UNIQUE INDEX IF NOT EXISTS "places_provider_place_id_key"
  ON "places" ("provider_place_id")
  WHERE "provider_place_id" IS NOT NULL;
