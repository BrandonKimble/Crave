-- GIN index for the descendant subtree walk's @> join (place-dag-read).
-- Attributed 2026-07-26: the walk's old `= ANY(parent_place_ids)` join form
-- seq-scanned the whole places catalog per recursion level — a country-scale
-- subject's expansion took 13-17s (the NY home-feed latency). The @> join +
-- this index runs the same subtree in ~28ms.
CREATE INDEX IF NOT EXISTS "idx_places_parent_place_ids_gin"
  ON "places" USING gin ("parent_place_ids");
