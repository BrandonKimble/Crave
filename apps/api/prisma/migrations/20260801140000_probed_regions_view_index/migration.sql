-- The asked-region memory is read PER SETTLE and scoped to the view
-- (red-team 2026-08-01). The original migration's sizing note — "row count
-- is governed-probe scale (tens)" — was wrong about its own growth law: the
-- reconciler writes a row per probing pass, and passes fire on every
-- viewport dwell and every search submit, retained 30 days. That is 10^4-10^5
-- rows at real traffic, not tens, and the read had no spatial predicate at
-- all. These indexes serve the view-scoped read the service now issues.
CREATE INDEX IF NOT EXISTS idx_probed_regions_box_extent
  ON probed_regions (min_lat, max_lat, min_lng, max_lng)
  WHERE kind = 'box';
CREATE INDEX IF NOT EXISTS idx_probed_regions_disc_center
  ON probed_regions (center_lat, center_lng)
  WHERE kind = 'disc';
