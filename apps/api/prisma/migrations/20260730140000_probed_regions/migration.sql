-- Docket #7 (abstraction audit): the reconciler's asked-region memory is a
-- DURABLE spend-avoidance fact (a probed region with a 30d TTL), and it lived
-- in a per-process array — forgotten on every restart, invisible to sibling
-- processes. One honest home. The judgment (probedRegionAnswersAnchor, the
-- scale gate) stays in TS; this table is the memory only. No GiST yet on
-- purpose (§16): row count is governed-probe scale (tens), and an index for
-- tens of rows is a pretend optimization — add it with the first measured
-- need.
CREATE TABLE probed_regions (
  region_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          varchar(4) NOT NULL,        -- 'disc' | 'box'
  center_lat    decimal(10,8),
  center_lng    decimal(11,8),
  radius_meters double precision,
  min_lat       decimal(10,8),
  min_lng       decimal(11,8),
  max_lat       decimal(10,8),
  max_lng       decimal(11,8),
  observed_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT probed_regions_shape_check CHECK (
    (kind = 'disc' AND center_lat IS NOT NULL AND center_lng IS NOT NULL
      AND radius_meters IS NOT NULL)
    OR (kind = 'box' AND min_lat IS NOT NULL AND min_lng IS NOT NULL
      AND max_lat IS NOT NULL AND max_lng IS NOT NULL)
  )
);
CREATE INDEX idx_probed_regions_observed_at ON probed_regions (observed_at);
