-- IDEAL-ABSTRACTION round 5 (measured): the fame-pin ST_Covers EXISTS was
-- 99% of every pooled search's cost (3.45s metro viewport → 27ms without).
-- The verdict is a pure function of location coords × score provenance ×
-- engine territory — zero request state — so it becomes STORED data,
-- recomputed off the hot path.
ALTER TABLE "core_restaurant_locations"
  ADD COLUMN "in_scoring_territory" BOOLEAN NOT NULL DEFAULT false;

UPDATE core_restaurant_locations rl
SET in_scoring_territory = TRUE
WHERE rl.latitude IS NOT NULL AND rl.longitude IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM core_public_entity_scores pes
    JOIN sources src ON src.source_id = pes.provenance_source_id
    LEFT JOIN engines eng ON eng.engine_id = src.engine_id
    JOIN places p ON p.place_id = ANY(
      CASE WHEN eng.engine_id IS NOT NULL THEN eng.member_place_ids
           ELSE ARRAY[src.anchor_place_id] END)
    WHERE pes.subject_type = 'restaurant'
      AND pes.subject_id = rl.restaurant_id
      AND EXISTS (
        SELECT 1 FROM place_geometries pgm
        WHERE pgm.place_id = p.place_id
          AND ST_Covers(pgm.geometry,
                ST_SetSRID(ST_MakePoint(rl.longitude::float8, rl.latitude::float8), 4326))));
