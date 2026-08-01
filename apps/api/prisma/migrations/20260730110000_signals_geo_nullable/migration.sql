-- Docket #3 (abstraction audit, both reviewers): post-P5b a signal has THREE
-- honest shapes — a rectangle (viewport), a point (entity_view), a PLACE
-- (poll anchor) — and NOT NULL geo forced anchored rows to manufacture a
-- centroid, the apparatus that already silently dropped poll acts once.
-- The CHECK states the shapes: an act carries an anchor OR a geometry,
-- always at least one.
ALTER TABLE signals
  ALTER COLUMN geo_min_lat DROP NOT NULL,
  ALTER COLUMN geo_min_lng DROP NOT NULL,
  ALTER COLUMN geo_max_lat DROP NOT NULL,
  ALTER COLUMN geo_max_lng DROP NOT NULL;
ALTER TABLE signals ADD CONSTRAINT signals_where_shape_check CHECK (
  place_id IS NOT NULL
  OR (geo_min_lat IS NOT NULL AND geo_min_lng IS NOT NULL
      AND geo_max_lat IS NOT NULL AND geo_max_lng IS NOT NULL)
);
