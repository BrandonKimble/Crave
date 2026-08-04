-- MULTILINGUAL WAVE 2 — M1 (locale on the wire), N10 (display indirection),
-- N6/D1 (render-from-recipe + the poll title marker), M2 (label sweep).
--
-- Three facts this migration makes storable:
--   1. users.locale — D4's PROFILE OVERRIDE half. Accept-Language is the
--      per-request default; this column is the user's explicit choice. It is
--      deliberately NOT the push-device row (a user who declines
--      notifications has no locale there, and the device row is a different
--      lifetime than a preference).
--   2. entity_labels.status — R5-6(b)/R5-10. The label sweep and the spine
--      seeder are MULTI-SAMPLE CONSENSUS producers: agreement lands 'active',
--      disagreement lands 'candidate' for review. Without a status column a
--      disputed label would either be published or lost; both are wrong.
--      Mirrors entity_alias.status exactly (same three values, same law).
--   3. poll_topics.title_source / title_locale — RATIFIED D1. Poll titles mix
--      TEMPLATED text (the weekly ritual writes "Best restaurants in X") with
--      USER-AUTHORED free text, and today nothing tells them apart. Templated
--      titles become recipes (renderable per locale); user-authored titles stay
--      literal with a source-language tag and are a translate-on-read surface.
--      A marker that cannot be derived after the fact is exactly the A10
--      failure mode, so it is written at the source going forward and
--      back-classified CONSERVATIVELY below (provably-templated only).
--
-- No table is rewritten here (three nullable/defaulted column adds and one
-- narrowly-scoped UPDATE over poll_topics, a small table), but the /dev/shm
-- law costs nothing to obey.
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

-- ---------------------------------------------------------------------
-- 1. M1/D4 — the profile locale override.
-- ---------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale TEXT NULL;

COMMENT ON COLUMN users.locale IS
  'Canonical BCP 47 (R5-5) explicit user preference. NULL = negotiate from Accept-Language per request. Never populated from the push-device row.';

-- ---------------------------------------------------------------------
-- 2. M2/R5-10 — label status (the review lane for consensus disagreement).
-- ---------------------------------------------------------------------
ALTER TABLE entity_labels
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entity_labels_status_check'
  ) THEN
    ALTER TABLE entity_labels
      ADD CONSTRAINT entity_labels_status_check
      CHECK (status IN ('candidate', 'active', 'deprecated'));
  END IF;
END $$;

-- Display reads only 'active' rows, so the index that serves the display
-- function must carry status or every lookup filters after the fetch.
CREATE INDEX IF NOT EXISTS idx_entity_labels_locale_status
  ON entity_labels (locale, status);

-- ---------------------------------------------------------------------
-- 3. D1 — the poll title marker.
-- ---------------------------------------------------------------------
ALTER TABLE poll_topics
  ADD COLUMN IF NOT EXISTS title_source TEXT NOT NULL DEFAULT 'user';
ALTER TABLE poll_topics
  ADD COLUMN IF NOT EXISTS title_locale TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'poll_topics_title_source_check'
  ) THEN
    ALTER TABLE poll_topics
      ADD CONSTRAINT poll_topics_title_source_check
      CHECK (title_source IN ('template', 'user'));
  END IF;
END $$;

-- CONSERVATIVE BACK-CLASSIFICATION. 'user' is the DEFAULT and the safe
-- verdict: mislabelling user prose as a template would render a stranger's
-- words as a machine sentence. A row is promoted to 'template' only when BOTH
-- (a) its metadata names the ONE templated writer in the repo
-- (PollWeeklyRitualService stamps metadata.source), and (b) its title matches
-- one of that writer's THREE exact template shapes. Every other historical
-- row — user-created topics (polls.service), graduated poll questions
-- (poll-graduation), ballot topics (poll-ballot-mention, which wraps USER
-- question text) — stays 'user'.
UPDATE poll_topics
SET title_source = 'template',
    title_locale = 'en'
WHERE metadata->>'source' = 'poll_supply_weekly_ritual'
  AND (
    title LIKE 'Best restaurants in %'
    OR (title LIKE 'What''s the best %' AND title LIKE '% right now?')
    OR (title LIKE 'What should we order at %' AND title LIKE '%?')
  );

-- User-authored titles carry the language they were WRITTEN in. Everything in
-- the corpus predates locale on the wire, so 'en' is the only honest tag we
-- have for existing rows; going forward the writer stamps the request locale.
UPDATE poll_topics
SET title_locale = 'en'
WHERE title_source = 'user' AND title_locale IS NULL;

COMMENT ON COLUMN poll_topics.title_source IS
  'D1: template = renderable from a recipe per locale; user = literal user prose, translate-on-read only.';
COMMENT ON COLUMN poll_topics.title_locale IS
  'BCP 47 language the title text is IN (source language for user prose; render locale for templates).';
