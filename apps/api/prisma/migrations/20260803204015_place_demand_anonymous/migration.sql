-- NEUTRALISED (2026-08-03), never applied successfully anywhere.
--
-- This migration created a place-level demand snapshot table and then failed
-- on its own index ("column day does not exist"), so it was recorded as FAILED
-- rather than applied — editing it cannot produce a checksum mismatch. The
-- table it created is dropped by the retire migration below, along with the
-- whole parallel-anonymous-table approach. See signals/subject-text-floor.ts
-- for why that approach was wrong and what replaced it.
SELECT 1;
