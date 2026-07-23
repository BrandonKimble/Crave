-- WAVE-6 punch item 9 (2026-07-22): dormant enum-member drop.
-- No writers of PollState.draft/scheduled or PollTopicStatus.draft/ready since
-- 1ac21b70 (birth certificates are written already-archived; polls are created
-- active). DB audit at migration time: polls.state = {closed:94} only;
-- poll_topics.status = {ready:366, archived:80} — the 366 `ready` rows are the
-- dead pre-1ac21b70 ready-pool (nothing will ever launch them; 7 already have
-- closed polls), mapped to `archived` (the terminal record state) below.
-- Postgres cannot drop enum members in place: recreate each type, cast, swap.

-- ── polls.state: poll_state loses draft + scheduled ─────────────────────────
ALTER TABLE polls ALTER COLUMN state DROP DEFAULT;

CREATE TYPE poll_state_new AS ENUM ('active', 'closed', 'archived');

ALTER TABLE polls
  ALTER COLUMN state TYPE poll_state_new
  USING (state::text::poll_state_new);

DROP TYPE poll_state;
ALTER TYPE poll_state_new RENAME TO poll_state;

-- ── poll_topics.status: poll_topic_status loses draft + ready ───────────────
ALTER TABLE poll_topics ALTER COLUMN status DROP DEFAULT;

-- Legacy ready-pool rows → archived (see header for the honesty audit).
UPDATE poll_topics SET status = 'archived' WHERE status::text <> 'archived';

CREATE TYPE poll_topic_status_new AS ENUM ('archived');

ALTER TABLE poll_topics
  ALTER COLUMN status TYPE poll_topic_status_new
  USING (status::text::poll_topic_status_new);

DROP TYPE poll_topic_status;
ALTER TYPE poll_topic_status_new RENAME TO poll_topic_status;

-- ── the scheduled-release index dies with the scheduled state ────────────────
DROP INDEX IF EXISTS idx_polls_scheduled_for;
