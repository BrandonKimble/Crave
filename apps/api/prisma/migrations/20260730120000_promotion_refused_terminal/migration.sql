-- Docket #2: a REFUSED claim is a FACT, not a retryable condition. The
-- entity-exclusivity and wrong-entity rejections re-learned the same truth
-- every month window forever, re-spending draws each time. refused_at is
-- terminal: the drain never selects a refused row again.
ALTER TABLE place_geometry_promotions ADD COLUMN refused_at timestamp(3);
