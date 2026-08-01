-- P4 COMPLETE (one-ground charter): the four stored bbox columns die.
--
-- A place has ONE ground: its real polygon. The bbox was a second, weaker,
-- DERIVED shape stored decoupled from its source — the named abstraction's
-- second face — and every consumer now derives the envelope from the ground
-- at the moment of use (derivedBboxSelectSql, wrap-aware at the seam; the
-- launch camera; the enrichment bias radius; the identity decision table;
-- the merge law's widen — which now grows the sketch GROUND itself).
--
-- The bbox-envelope expression GiST index dies with them: since P2 the
-- candidate finder is ST_Covers/&& on place_geometries.geometry directly.
DROP INDEX IF EXISTS "Place_bbox_envelope_gist_idx";
ALTER TABLE places
  DROP COLUMN IF EXISTS bbox_min_lat,
  DROP COLUMN IF EXISTS bbox_min_lng,
  DROP COLUMN IF EXISTS bbox_max_lat,
  DROP COLUMN IF EXISTS bbox_max_lng;
