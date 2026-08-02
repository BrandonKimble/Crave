-- DISEASE B: A MEMORY WITHOUT IDENTITY (re-derivation 2026-08-01).
--
-- The catalog learned this the expensive way: identity is the vendor's key,
-- UPSERT, never append. The asked-region memory repeated the mistake — one
-- row appended per probing pass, per dwell and per search submit, retained
-- 30 days. Growth tracked TRAFFIC instead of GEOGRAPHY: a busy city
-- accumulates rows forever for ground that never changes, and no LIMIT,
-- dedupe or prune schedule fixes a memory that has no identity.
--
-- The identity was already sitting in the service: viewportCellKey, the
-- quantized cell the single-flight guard has always used. A region observed
-- for a cell REPLACES the previous observation for that cell (refreshing
-- observed_at), so the table is bounded by the world at the levels people
-- actually look at, and dedupe becomes structural rather than a policy.
--
-- Legacy rows carry no cell; they age out under the same 30-day TTL.
ALTER TABLE probed_regions ADD COLUMN IF NOT EXISTS cell_key VARCHAR(64);

-- One live memory per (cell, kind). Partial so legacy NULL-cell rows are
-- untouched and simply expire.
CREATE UNIQUE INDEX IF NOT EXISTS uq_probed_regions_cell_kind
  ON probed_regions (cell_key, kind)
  WHERE cell_key IS NOT NULL;
