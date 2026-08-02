-- LEGACY RESIDUE of charter law #2 (data-at-rest audit, 2026-08-01).
--
-- 52 places on prod carry a real vendor ground and NO representative point:
-- 50 of the 51 US states (Texas is the exception), Canada and Puerto Rico.
-- Every one was promoted BEFORE the centroid coupling landed on 2026-07-29;
-- measured: 52 before, 0 after. So the MECHANISM is already correct — the
-- promotion write repairs a point that is NULL or off-ground — and this
-- class cannot regenerate. What remains is residue that nothing re-promotes,
-- because a promoted place is never promoted again.
--
-- The charter's own rule: a one-off repair treats the symptom, the coupling
-- removes the disease. The coupling is in place; this is the repair.
--
-- Any state- or country-level read that needs a point (map framing, "near
-- me" fallbacks, poll local-time seeding) was getting null for these.
-- ST_PointOnSurface is inside the polygon by construction, and picks a point
-- on one arm of a crossing geometry just fine.
UPDATE places p SET
  centroid_lat = ST_Y(ST_PointOnSurface(g.geometry)),
  centroid_lng = ST_X(ST_PointOnSurface(g.geometry))
FROM place_geometries g
WHERE g.place_id = p.place_id
  AND g.geometry IS NOT NULL
  -- OUTLINE-GRADE ONLY. The coupling this mirrors runs after a real vendor
  -- polygon lands; running it over SKETCH rectangles would stamp a bbox
  -- centre into the column the promotion wrong-entity guard treats as the
  -- place's anchor — replacing an honest "no anchor yet, defer" with
  -- fabricated evidence. On prod all 52 rows are outlined, but this
  -- migration also runs on staging, local and every future fresh database.
  AND g.provider_boundary_id IS NOT NULL
  AND p.centroid_lat IS NULL;
