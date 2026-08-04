-- THE ANONYMOUS DEMAND TABLE — what ranking reads, and the only demand store
-- that outlives a person.
--
-- WHY (measured 2026-08-03): `signals` and `signal_demand_daily` both carry
-- `actor_id` AND raw `subject_text`. 26 of 30 distinct search subjects had
-- exactly ONE distinct actor, so those rows single out a person by
-- construction — dropping the actor id would not anonymise a row that is
-- unique on its text + viewport + time. Nothing in the pipeline ever
-- aggregated ACROSS people, which is the only operation that makes demand
-- data anonymous.
--
-- Two needs, two lifecycles (verified against every consumer):
--   GLOBAL demand (ranking, collection targeting, popularity, suggestions)
--     needs only HOW MANY DISTINCT PEOPLE wanted X near Y. -> this table.
--   PERSONAL demand (the taste profile) needs the person, is the person's own
--     data, and dies with the account. -> stays in the per-actor tables.
--
-- THE K-FLOOR IS APPLIED AT PROMOTION, NOT AT READ. A subject's free text is
-- written here ONLY once >= K distinct people used it; below the floor the
-- demand still counts but the text is suppressed to NULL. An identifying row
-- therefore never lands in this table, so no reader can leak one by
-- forgetting a filter.
CREATE TABLE IF NOT EXISTS signal_demand_anonymous (
  row_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day              date        NOT NULL,
  place_id         uuid,
  kind             varchar(32) NOT NULL,
  subject_type     varchar(32) NOT NULL,
  subject_id       uuid,
  -- NULL when the subject is below the k-floor: the count survives, the words
  -- do not. Entity subjects (subject_id) are catalogue references, not a
  -- person's words, and are never suppressed.
  subject_text     varchar(256),
  distinct_actors  integer     NOT NULL,
  act_count        bigint      NOT NULL,
  computed_at      timestamptz NOT NULL DEFAULT now()
);

-- One row per (day, area, subject). COALESCE because place_id/subject_id/
-- subject_text are legitimately null and NULLs do not compare equal.
CREATE UNIQUE INDEX IF NOT EXISTS idx_demand_anon_key
  ON signal_demand_anonymous (
    day,
    COALESCE(place_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind, subject_type,
    COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(subject_text, '')
  );

CREATE INDEX IF NOT EXISTS idx_demand_anon_lookup
  ON signal_demand_anonymous (kind, subject_type, subject_id, day);
CREATE INDEX IF NOT EXISTS idx_demand_anon_place_day
  ON signal_demand_anonymous (place_id, day);

COMMENT ON TABLE signal_demand_anonymous IS
  'Anonymous global demand. No actor column by construction. Free text present only above the k-anonymity floor. This is what ranking reads; it never reads per-actor tables.';
