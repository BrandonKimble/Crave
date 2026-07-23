-- GROUND UNIFICATION (plan §2.6, ratified 2026-07-22): place_geometries
-- becomes the UNIVERSAL ground store. Every place that has a bbox but no
-- geometry row gains a sketch-grade rectangular polygon — the bbox envelope
-- stored in the SAME geometry column the drain writes outlines to.
-- Sketch-grade marker: provider_boundary_id IS NULL (an outline always
-- carries the vendor geometry id). Precision improves IN PLACE: the drain's
-- persistPolygon ON CONFLICT upsert overwrites the envelope with the real
-- outline and stamps provider_boundary_id — sketch→outline upgrade works
-- even from a pre-§2.6 binary, so this backfill is drain-concurrent-safe
-- (ON CONFLICT DO NOTHING yields to any outline that lands mid-statement).
--
-- Guards:
--  * zero-span bboxes cannot form a MultiPolygon — skipped (no ground
--    knowledge worth storing; none exist live);
--  * bbox-less places stay geometry-less (no ground knowledge at all);
--  * antimeridian-crossing bboxes (min_lng > max_lng) store the union of
--    their two arms (never one seam-spanning rectangle); none exist live,
--    branch kept for re-runs/other environments.

-- Non-crossing sketches: the plain envelope.
INSERT INTO place_geometries (place_id, provider_boundary_id, fetched_at, geometry)
SELECT p.place_id,
       NULL,
       now(),
       ST_Multi(ST_MakeEnvelope(
         p.bbox_min_lng::float8, p.bbox_min_lat::float8,
         p.bbox_max_lng::float8, p.bbox_max_lat::float8, 4326))
FROM places p
WHERE p.bbox_min_lat IS NOT NULL
  AND p.bbox_min_lat < p.bbox_max_lat
  AND p.bbox_min_lng < p.bbox_max_lng
  AND NOT EXISTS (SELECT 1 FROM place_geometries g WHERE g.place_id = p.place_id)
ON CONFLICT (place_id) DO NOTHING;

-- Crossing sketches: two arms, unioned.
INSERT INTO place_geometries (place_id, provider_boundary_id, fetched_at, geometry)
SELECT p.place_id,
       NULL,
       now(),
       ST_Multi(ST_Union(
         ST_MakeEnvelope(p.bbox_min_lng::float8, p.bbox_min_lat::float8,
                         180::float8, p.bbox_max_lat::float8, 4326),
         ST_MakeEnvelope((-180)::float8, p.bbox_min_lat::float8,
                         p.bbox_max_lng::float8, p.bbox_max_lat::float8, 4326)))
FROM places p
WHERE p.bbox_min_lat IS NOT NULL
  AND p.bbox_min_lat < p.bbox_max_lat
  AND p.bbox_min_lng > p.bbox_max_lng
  AND NOT EXISTS (SELECT 1 FROM place_geometries g WHERE g.place_id = p.place_id)
ON CONFLICT (place_id) DO NOTHING;
