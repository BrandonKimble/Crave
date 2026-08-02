-- A FAULT IS NOT A MISS (red-team 2026-08-01). `attempts` counted BOTH: a
-- vendor 500, a null geometry id, a no-anchor deferral and a per-item throw
-- all incremented the same column the miss ceiling reads. Two transport
-- errors plus one genuine miss therefore TERMINALLY refused a perfectly good
-- row — closing the only path by which that place could ever earn a ground.
-- The distinction the ceiling needs is "the vendor has no polygon for this
-- id", so that gets its own counter; `attempts` stays the fault counter.
ALTER TABLE place_geometry_promotions
  ADD COLUMN IF NOT EXISTS miss_attempts INTEGER NOT NULL DEFAULT 0;
