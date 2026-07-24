-- No-fake-estimates law: keyword cooldown TIMERS die; eligibility becomes a
-- DERIVED expectation (corpus-delta × measured term share). The harvest
-- snapshot (when the query last actually ran against the vendor, how many
-- results it returned, how big the source corpus was) is the whole state.
ALTER TABLE collection_keyword_attempt_history
  ADD COLUMN last_harvest_at timestamptz,
  ADD COLUMN last_result_count integer,
  ADD COLUMN corpus_docs_at_harvest integer;
ALTER TABLE collection_keyword_attempt_history DROP COLUMN cooldown_until;
