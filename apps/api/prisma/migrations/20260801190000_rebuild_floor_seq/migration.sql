-- COMPARE A SEQUENCE, NOT A VALUE (red-team 2026-08-01).
--
-- The floor was retired by matching the timestamp the pass had read back
-- against the stored one. Two ways that fails, both measured:
--   1. rebuild_floor is TIMESTAMPTZ (microseconds); Prisma reads it into a JS
--      Date (milliseconds) and re-binds the truncated value. 28% of prod
--      signals carry sub-millisecond recorded_at, so those floors could NEVER
--      match and NEVER retire — every 15-minute refresh would re-derive every
--      day back to that floor, forever.
--   2. pullDemandWatermarkBack uses LEAST, so a promotion landing mid-pass
--      whose oldest signal is LATER than the standing floor leaves the column
--      UNCHANGED — the pass then matches it and clears, swallowing exactly
--      the invalidation the floor exists to carry.
-- Both dissolve if the question stops being "is this the same instant?" and
-- becomes "has anything asked for a rebuild since I looked?". That is a
-- counter, and it is exact by construction.
ALTER TABLE signal_demand_rebuild_state
  ADD COLUMN IF NOT EXISTS rebuild_floor_seq BIGINT NOT NULL DEFAULT 0;
