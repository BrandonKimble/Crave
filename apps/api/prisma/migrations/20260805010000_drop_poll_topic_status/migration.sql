-- A COLUMN THAT CAN HOLD EXACTLY ONE VALUE IS NOT A STATUS.
--
-- Measured before dropping:
--   - the poll_topic_status enum has ONE label, 'archived';
--   - all 18,284 poll_topics rows are 'archived';
--   - four writers exist (polls.service.ts, poll-weekly-ritual.service.ts,
--     and two fixture seeders) and every one of them hardcodes
--     PollTopicStatus.archived;
--   - ZERO readers. Nothing in src/ or scripts/ filters, groups, or branches
--     on it.
--
-- This is residue from a lifecycle that was drained: the other labels were
-- removed from the enum at some point and the survivors were all migrated to
-- the terminal state, leaving a column that records a fact already implied by
-- the row existing.
--
-- idx_poll_topics_status goes with it — an index on a constant column can
-- only ever return the whole table, which is why it has 2 lifetime scans.

DROP INDEX IF EXISTS idx_poll_topics_status;
ALTER TABLE poll_topics DROP COLUMN IF EXISTS status;
DROP TYPE IF EXISTS poll_topic_status;
