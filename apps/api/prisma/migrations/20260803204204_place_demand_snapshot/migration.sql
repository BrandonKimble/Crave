-- NEUTRALISED (2026-08-03), never applied anywhere.
--
-- This migration errored on creation ("column day does not exist") and so was
-- never recorded in _prisma_migrations in any environment — editing it cannot
-- produce a checksum mismatch. It indexed a snapshot table that the very next
-- migration drops; shipping a broken statement followed by a DROP would be
-- theatre. Its subject and rationale are in the retire migration that follows.
SELECT 1;
