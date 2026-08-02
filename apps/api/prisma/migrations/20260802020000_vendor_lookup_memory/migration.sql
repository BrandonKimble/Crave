-- REMEMBER WHAT YOU ASKED (2026-08-01). The same law as probed_regions on
-- the geo side, applied to the vendor's other mouth: a name the vendor could
-- not resolve is an ANSWER, and asking again costs money to learn the same
-- nothing. Ten retries of a typo used to be ten paid lookups.
--
-- Only MISSES are remembered. A hit needs no memory — it creates the entity,
-- and the entity is the memory.
CREATE TABLE IF NOT EXISTS vendor_lookup_misses (
  lookup_key   VARCHAR(200) PRIMARY KEY,
  vendor       VARCHAR(32)  NOT NULL,
  observed_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- The TTL is the only writer of absence: the vendor's catalog changes, so a
-- miss is a fact with a shelf life, never a permanent verdict.
CREATE INDEX IF NOT EXISTS idx_vendor_lookup_misses_observed_at
  ON vendor_lookup_misses (observed_at);
