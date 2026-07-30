-- A Gemini context cache is a PAID, TTL-bearing vendor resource, and until
-- now its only identity was a private field on a per-process singleton: api,
-- worker, and every script each minted their own copy of the SAME prompt
-- (62 storage rows / ~$27 of rentals in one day of script boots), nothing
-- ever called caches.delete, and metering could only book estimates.
-- This registry gives the resource a durable, content-addressed identity:
-- one row per vendor cache, keyed by (model, prompt_hash), shared by every
-- process. Lookup-before-mint, extend-instead-of-remint, retire-with-
-- refcount all hang off this table.
CREATE TABLE IF NOT EXISTS gemini_context_caches (
  name         VARCHAR(256) PRIMARY KEY,
  model        VARCHAR(128) NOT NULL,
  prompt_hash  VARCHAR(64)  NOT NULL,
  token_count  INTEGER      NOT NULL,
  caller       VARCHAR(128) NOT NULL,
  created_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   TIMESTAMP(3) NOT NULL,
  retired_at   TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS idx_gemini_context_caches_lookup
  ON gemini_context_caches (model, prompt_hash, retired_at);
