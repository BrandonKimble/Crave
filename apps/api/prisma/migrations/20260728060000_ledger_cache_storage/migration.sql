-- Cache creation and cache STORAGE are paid Gemini operations that the usage
-- ledger never recorded (verified: the ledger has only 8 distinct operations
-- and none of them is a cache op). The spend governor meters exclusively from
-- ledger rows, so this spend was structurally invisible to the backstop.
--
-- Storage bills per token-HOUR, a dimension no existing column carries.
-- Rather than overload cached_tokens with "token-hours", storage rows get
-- their own duration column so every column keeps exactly one meaning.
ALTER TABLE api_usage_ledger
  ADD COLUMN IF NOT EXISTS duration_hours DOUBLE PRECISION;
