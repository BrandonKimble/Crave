-- THE KEYWORD ATTEMPT LEDGER REMEMBERS THE QUERY, NOT JUST ITS FOLD
-- (multilingual spine, step 3).
--
-- `normalized_term` is a FOLD: NFKD then strip every combining mark. It is
-- the right key for the ledger — two spellings of one query must be one row —
-- and the wrong string to send to a search vendor. Measured:
--   normalizeKeywordTerm('bún đậu mắm tôm') === 'bun đau mam tom'
-- which is neither Vietnamese nor ASCII and matches nothing anywhere. On the
-- live corpus 194 of 373 non-ASCII active entity names lose combining marks
-- this way.
--
-- That mattered because the REFRESH slice of keyword selection builds its
-- outbound term straight from this ledger (`term: row.normalizedTerm`), so
-- every re-searched foreign-language term went out mangled in perpetuity —
-- and the zero results it got back were then written here as a harvest
-- snapshot, teaching the eligibility clamp that the term was barren.
--
-- The backfill sets term = normalized_term for existing rows. That is not a
-- fabrication: it is exactly the string those rows have been querying with.
-- New rows carry the real one.
--
-- Parallel-worker guard per AUTHORING.md §1: the UPDATE below has no WHERE.

SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

ALTER TABLE "collection_keyword_attempt_history"
  ADD COLUMN "term" VARCHAR(255);

UPDATE "collection_keyword_attempt_history"
   SET "term" = "normalized_term";

ALTER TABLE "collection_keyword_attempt_history"
  ALTER COLUMN "term" SET NOT NULL;
