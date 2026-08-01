-- Docket #4 (abstraction audit): three residue columns and one obsolete law.
--
-- local_script_alias: write-only — zero readers in api, shared, or mobile.
-- promoted_at (places): zero readers — the drain reads the QUEUE row's.
-- county: sole consumers were the census-resolve lane (deleted, docket #1)
--   and the name-identity decision table (deleted, the final dissolution);
--   the merge kept gap-filling fuel for an engine with no road.
--
-- uq_places_identity dies WITH county, and on principle: it enforced
-- NAME-uniqueness, which the mirror law does not require — two distinct
-- vendor entities may legitimately share (country, subdivision, level,
-- name); their identity is (geometry id, level), already unique. The
-- fallback lane (the one non-vendor path) keeps tuple-idempotence through
-- a partial unique of its own.
DROP INDEX IF EXISTS uq_places_identity;
CREATE UNIQUE INDEX uq_places_fallback_identity
  ON places (country_code, provider_level_code, lower(name))
  WHERE provider = 'fallback';
ALTER TABLE places
  DROP COLUMN IF EXISTS county,
  DROP COLUMN IF EXISTS local_script_alias,
  DROP COLUMN IF EXISTS promoted_at;
