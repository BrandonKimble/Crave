-- SHADOW DISCARD (big-one red team #3d): abandon a candidate prompt.
-- Deletes the candidate hash's extraction runs (cascading their events
-- and stored inputs — none are any document's active run, asserted
-- below), retires the prompt row, then leaves entity cleanup to
-- gc-unsupported-entities.sql (whose active-run filter now sees the
-- candidate's minted vocabulary as unsupported).
--
-- Usage: psql "$DB" -v version=<N> -f shadow-discard.sql
--        then: psql "$DB" -f gc-unsupported-entities.sql
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE candidate AS
SELECT content_hash FROM llm_prompts WHERE version = :'version'::int;

-- HARD ASSERT: never discard an ACTIVATED generation. If any document's
-- active run carries this hash, this is not a shadow — abort.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM collection_source_documents d
    JOIN collection_extraction_runs r ON r.extraction_run_id = d.active_extraction_run_id
    JOIN candidate c ON c.content_hash = r.system_prompt_hash
  ) THEN
    RAISE EXCEPTION 'version is ACTIVE for some documents — refusing to discard';
  END IF;
END $$;

DELETE FROM collection_extraction_coverage_claims cl
USING collection_extraction_runs r, candidate c
WHERE cl.extraction_run_id = r.extraction_run_id
  AND r.system_prompt_hash = c.content_hash;

DELETE FROM collection_extraction_runs r
USING candidate c
WHERE r.system_prompt_hash = c.content_hash;

UPDATE llm_prompts SET status = 'retired'
WHERE version = :'version'::int;

SELECT 'discarded version ' || :'version' AS result;
COMMIT;
