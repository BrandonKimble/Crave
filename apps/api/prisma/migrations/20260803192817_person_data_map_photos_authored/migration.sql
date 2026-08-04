-- Owner ruling 2026-08-03: uploaded PHOTOS are KEPT on account deletion
-- (anonymized), not deleted — the Strava model, contingent on the ToS
-- granting a content licence. So a photo is CONTENT the community built on,
-- not the person's own data. Same class as polls: keep the row, sever the
-- author. poll_comments/poll_endorsements join them for the same reason
-- (Reddit: "posts stay, but people can't see who they came from").
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
      WHEN tbl IN ('polls', 'poll_topics', 'curated_lists',
                   'photos', 'poll_comments', 'poll_endorsements')
        THEN 'authored'
      WHEN tbl = 'users' THEN 'root'
      ELSE 'person'
    END
  FROM discovered;
$$;
