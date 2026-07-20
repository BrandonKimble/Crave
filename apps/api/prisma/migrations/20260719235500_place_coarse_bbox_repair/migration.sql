-- Catalog data repair required by the §3 containment-TILING storage law
-- (red-team 3a). The US pre-seed minted the coarse DAG rows (49
-- CountrySubdivision + 1 Country) but left 48 states with NULL bboxes and
-- min/max-normalized the antimeridian-crossing US bbox inside out
-- (-66.95 → 172.44 eastward = the wrong hemisphere). With no coarse bboxes,
-- nothing dominates the towns and a continental signal degenerates to ~19k
-- rows — exactly the fan-out §3 forbids.
--
-- 1. Un-corrupt crossing bboxes: no real place spans > 180° of longitude
--    non-crossing; such rows are wrap-normalization damage — swap back to
--    the crossing representation (min_lng > max_lng). Idempotent: after the
--    swap the span test no longer matches.
UPDATE places
SET (bbox_min_lng, bbox_max_lng) = (bbox_max_lng, bbox_min_lng)
WHERE bbox_min_lat IS NOT NULL
  AND bbox_max_lng - bbox_min_lng > 180;

-- 2. Sketch missing coarse bboxes as the union of their children's bboxes
--    (§1: a sketch conflict bbox-merges; the children ARE the best sketch
--    until a provider boundary arrives). Antimeridian care: a naive union
--    spanning > 180° means the children straddle ±180 — store the crossing
--    interval (east-hemisphere min → west-hemisphere max) instead.
--    Idempotent: only NULL-bbox rows are touched.
WITH derived AS (
  SELECT
    par.place_id,
    MIN(c.bbox_min_lat) AS min_lat,
    MAX(c.bbox_max_lat) AS max_lat,
    MIN(c.bbox_min_lng) AS min_lng,
    MAX(c.bbox_max_lng) AS max_lng,
    MIN(c.bbox_min_lng) FILTER (WHERE c.bbox_min_lng > 0) AS cross_min,
    MAX(c.bbox_max_lng) FILTER (WHERE c.bbox_max_lng < 0) AS cross_max
  FROM places par
  JOIN places c
    ON par.place_id = ANY(c.parent_place_ids)
   AND c.bbox_min_lat IS NOT NULL
   AND c.bbox_min_lng <= c.bbox_max_lng
  WHERE par.bbox_min_lat IS NULL
  GROUP BY par.place_id
)
UPDATE places p
SET bbox_min_lat = d.min_lat,
    bbox_max_lat = d.max_lat,
    bbox_min_lng = CASE
      WHEN d.max_lng - d.min_lng > 180
           AND d.cross_min IS NOT NULL AND d.cross_max IS NOT NULL
        THEN d.cross_min
      ELSE d.min_lng
    END,
    bbox_max_lng = CASE
      WHEN d.max_lng - d.min_lng > 180
           AND d.cross_min IS NOT NULL AND d.cross_max IS NOT NULL
        THEN d.cross_max
      ELSE d.max_lng
    END
FROM derived d
WHERE p.place_id = d.place_id;
