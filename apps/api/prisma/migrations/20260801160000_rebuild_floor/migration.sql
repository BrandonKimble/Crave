-- ONE CURSOR CARRYING TWO FACTS (re-derivation 2026-08-01).
--
-- signal_demand_rebuild_state.watermark answered "how far have we built?" —
-- a MONOTONE cursor, and the refresh advances it with GREATEST precisely so
-- a slow pass can never move it backwards. But the geometry-upgrade hook
-- needed to say a DIFFERENT thing: "these older days must be rebuilt,
-- because their attribution was computed against a rectangle that has since
-- become a real polygon". It said that by moving the cursor BACKWARDS —
-- against the one invariant the cursor exists to hold. A refresh in flight
-- (the aggregate runs on the worker, the promotion on the api) then wrote
-- GREATEST(captured, pulled-back) and ERASED the request. The upgrade never
-- re-attributed, permanently, and nothing retried.
--
-- An invalidation is its own fact and gets its own home: a FLOOR the
-- refresh consumes and clears, transactionally, instead of a backwards move
-- in a counter whose whole job is to never move backwards.
ALTER TABLE signal_demand_rebuild_state
  ADD COLUMN IF NOT EXISTS rebuild_floor TIMESTAMPTZ;
