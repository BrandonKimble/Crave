-- D40 — the personalization substrate. ADDITIVE ONLY: no column is dropped,
-- no stored answer document is edited. Every step below is independently
-- shippable and nothing is user-visible until the builder switches over.

-- 1. Server-owned question-set version + the city as a KEY -------------------
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "onboarding_question_set_version" integer,
  ADD COLUMN IF NOT EXISTS "onboarding_city_place_id" uuid;

-- 2. The append-only answer history ------------------------------------------
CREATE TABLE IF NOT EXISTS "user_onboarding_responses" (
  "response_id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"               uuid NOT NULL,
  "answered_with_version" integer NOT NULL,
  "question_set_version"  integer NOT NULL,
  "answers"               jsonb NOT NULL,
  "source"                varchar(16) NOT NULL,
  "recorded_at"           timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "user_onboarding_responses_user_id_recorded_at_idx"
  ON "user_onboarding_responses" ("user_id", "recorded_at" DESC);

-- Backfill: one row per user who already answered. The pre-history column is
-- the ONLY copy of those answers, so it becomes row 1 of the history rather
-- than being left as an orphan projection with nothing behind it.
--   answered_with_version: what the client declared at the time (the only
--     version fact that exists for these rows).
--   question_set_version: 1 — legacy documents were written against question
--     set v1, which is what the decoder decodes a null version AS. Not a
--     guess: it is the set those keys belong to.
INSERT INTO "user_onboarding_responses" (
  "user_id", "answered_with_version", "question_set_version",
  "answers", "source", "recorded_at"
)
SELECT
  u."user_id",
  u."onboarding_version",
  1,
  u."onboarding_responses",
  'backfill',
  COALESCE(u."onboarding_completed_at", now())
FROM "users" u
WHERE u."onboarding_responses" IS NOT NULL
  AND jsonb_typeof(u."onboarding_responses") = 'object';

-- The projection now has history behind it, so it can honestly declare which
-- question set it was decoded as.
UPDATE "users"
SET "onboarding_question_set_version" = 1
WHERE "onboarding_responses" IS NOT NULL
  AND "onboarding_question_set_version" IS NULL;

-- 3. City backfill by name match — UNMATCHED ARE COUNTED, NEVER SILENT -------
-- This is the LAST time a city is resolved by name. The live-city definition
-- is the same one the builder and the poll seed use: places carrying a
-- collection source anchor (sources.anchor_place_id, poll_surface excluded —
-- those are per-place poll mouths, not corpus coverage).
UPDATE "users" u
SET "onboarding_city_place_id" = live."place_id"
FROM (
  SELECT DISTINCT s."anchor_place_id" AS place_id, lower(p."name") AS lname
  FROM "sources" s
  JOIN "places" p ON p."place_id" = s."anchor_place_id"
  WHERE s."anchor_place_id" IS NOT NULL
    AND s."platform" <> 'poll_surface'
) live
WHERE u."onboarding_city_place_id" IS NULL
  AND u."onboarding_selected_city" IS NOT NULL
  AND lower(u."onboarding_selected_city") = live."lname";

-- The always-green risk, answered inside the migration: a name that matched
-- nothing is RAISED as a NOTICE with its count and its distinct values. A
-- silent zero here would be the exact defect this column exists to kill.
DO $$
DECLARE
  unmatched_count integer;
  unmatched_names text;
BEGIN
  SELECT count(*), COALESCE(string_agg(DISTINCT "onboarding_selected_city", ', '), '')
    INTO unmatched_count, unmatched_names
  FROM "users"
  WHERE "onboarding_selected_city" IS NOT NULL
    AND "onboarding_city_place_id" IS NULL
    AND "deleted_at" IS NULL;
  IF unmatched_count > 0 THEN
    RAISE NOTICE 'D40 city backfill: % user(s) have a selected city that matches NO live city. Names: %',
      unmatched_count, unmatched_names;
  ELSE
    RAISE NOTICE 'D40 city backfill: every selected city resolved to a live place.';
  END IF;
END $$;

-- 4. The derived taste profile (built DARK: nothing reads it yet) ------------
CREATE TABLE IF NOT EXISTS "user_taste_profile" (
  "row_id"       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id"     uuid NOT NULL,
  "window_days"  integer NOT NULL,
  "subject_kind" varchar(16) NOT NULL,
  "subject_id"   uuid,
  "subject_text" varchar(255),
  "kind"         varchar(32) NOT NULL,
  "act_count"    integer NOT NULL,
  "last_act_at"  timestamptz(3) NOT NULL,
  "rebuilt_at"   timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "user_taste_profile_actor_id_window_days_idx"
  ON "user_taste_profile" ("actor_id", "window_days");
CREATE INDEX IF NOT EXISTS "user_taste_profile_subject_id_window_days_idx"
  ON "user_taste_profile" ("subject_id", "window_days");
