-- Catalog-revision read (header freshness, 2026-08-01): the watermark asks
-- "newest ground write in this region?" on every feed request. Without this
-- index the max() form seq-scanned every ground at world zoom — MEASURED
-- 61.3ms over 22,769 rows on the prod copy, growing linearly with the
-- catalog. DESC lets the planner walk the index backward and stop at the
-- first row inside the box (0.063ms); small boxes still take the GiST path.
CREATE INDEX IF NOT EXISTS idx_place_geometries_fetched_at
  ON place_geometries (fetched_at DESC);
