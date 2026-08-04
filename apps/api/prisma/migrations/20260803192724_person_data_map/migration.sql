-- THE ONE DEFINITION OF "A PERSON'S DATA".
--
-- Three consumers used to answer this question separately and disagree:
--   1. account deletion (a hand-written list of deleteMany calls),
--   2. the staging PII scrub (a column-name regex),
--   3. preserved-anchors.sql (a hand-enumerated union).
-- Disagreement is not hypothetical: deletion never severed signal_actors
-- (device fingerprints) or signals.subject_text (raw typed search text),
-- which the scrub itself classifies as hard PII.
--
-- It lives in SQL, not TypeScript, because the consumers are BOTH — a psql
-- script and a Nest service. A definition that cannot be shared gets copied.
--
-- CLASSES:
--   person   - the row IS a person's data. Delete it (per-user or wholesale).
--   authored - CONTENT a person made that others built on. Keep the row,
--              sever the authorship (the Reddit/Discord pattern: "posts stay,
--              but people can't see who they came from").
-- Anything not returned is corpus/business data and is never touched.
CREATE OR REPLACE FUNCTION crave_person_data_map()
RETURNS TABLE (table_name text, person_column text, data_class text)
LANGUAGE sql STABLE AS $$
  WITH discovered AS (
    SELECT c.table_name::text AS tbl, c.column_name::text AS col
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name ~ '(^|_)(user|actor|owner|sender|reporter|follower|blocker|blocked|creator)_id$'
  )
  SELECT tbl, col,
    CASE
      -- CONTENT the community built on: keep it, sever the author.
      -- polls/poll_topics carry a nullable creator with no FK; curated_lists
      -- are editorial home content (global rows have a NULL owner).
      WHEN tbl IN ('polls', 'poll_topics', 'curated_lists') THEN 'authored'
      -- `users` is the root; it is handled explicitly by its caller (a
      -- TRUNCATE ... CASCADE here would wipe every referencing table).
      WHEN tbl = 'users' THEN 'root'
      ELSE 'person'
    END
  FROM discovered;
$$;

COMMENT ON FUNCTION crave_person_data_map() IS
  'Single source of truth for "what is a person''s data". Consumed by account deletion (per-user) and the staging scrub (wholesale). Extend the PATTERN, never a caller-side list.';
