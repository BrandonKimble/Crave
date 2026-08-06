-- THE CONVERSION THAT WAS RECORDED BUT NEVER RAN.
--
-- 20260802060000_timestamptz_everywhere holds the 162 ALTERs and the reasoning
-- for them. It is recorded in _prisma_migrations with applied_steps_count = 0
-- and started_at = finished_at — the signature of `migrate resolve --applied`,
-- not of a run. Measured after the fact: 155 columns were still
-- `timestamp without time zone`, and every timestamptz column in the database
-- belonged to a table CREATED after that date. Zero of the targets converted.
--
-- It very likely died the way AUTHORING.md §1 says heavy rewrites die on prod's
-- small /dev/shm ("could not resize shared memory segment") — the original file
-- carries no parallel-worker guard. This one does.
--
-- WHY THIS MATTERS MORE THAN A TYPE TIDY: commit d76199285 deleted the
-- mitigations (`utcInstant`, its source scanner, the session pin) on the
-- strength of a conversion that had not happened. `grep utcInstant` returns
-- nothing today. So the bug class the original header describes — Prisma binds
-- a JS Date as timestamptz, comparing it against a naive column coerces through
-- the SESSION timezone, which once made a polls cursor match 3,175 rows where
-- the correct comparison matched 16,528 — is currently live WITH ITS GUARD
-- REMOVED. schema.prisma also declares these columns @db.Timestamptz(3), so the
-- ORM's type contract has been false the whole time.
--
-- IDEMPOTENT BY CONSTRUCTION. It reads information_schema and converts whatever
-- is still naive, so it is correct whether an environment converted some, none,
-- or all of them — and a no-op forever after. That is what makes it safe to
-- deploy across local / staging / prod, which are known to disagree.
--
-- The stored wall-clock IS UTC, so the cast is `AT TIME ZONE 'UTC'`; precision
-- is read from the column rather than assumed (both p3 and p6 columns exist).
--
-- ONE STATEMENT PER TABLE, NOT PER COLUMN. Converting a single column of a
-- cross-column CHECK leaves the pair mixed-type for the duration of the
-- statement, and Postgres then re-validates the constraint through the SESSION
-- timezone — exactly the coercion this migration exists to abolish. Measured:
-- a per-column loop dies on billing_subscriptions with "check constraint
-- check_subscription_period_consistency is violated by some row", on rows that
-- are perfectly consistent. This is very likely how the original run actually
-- failed. Batching every column of a table into ONE ALTER TABLE keeps the row
-- self-consistent at every point a constraint can observe it.
--
-- ONE EXCEPTION, STRUCTURAL: signals.occurred_at stays naive — Postgres refuses
-- to alter a range partition key's type. Its comparisons keep going through the
-- signals module's own utcInstantSql, which is why THAT helper survived the
-- deletion of the others.

SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT c.table_name,
           string_agg(
             format('ALTER COLUMN %I TYPE timestamptz(%s) USING %I AT TIME ZONE ''UTC''',
                    c.column_name, COALESCE(c.datetime_precision, 3), c.column_name),
             ', ' ORDER BY c.column_name
           ) AS alters
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.data_type = 'timestamp without time zone'
      AND t.table_type = 'BASE TABLE'
      AND NOT (c.table_name = 'signals' AND c.column_name = 'occurred_at')
      AND c.table_name NOT LIKE 'signals\_%'
    GROUP BY c.table_name
    ORDER BY c.table_name
  LOOP
    EXECUTE format('ALTER TABLE %I %s', tbl.table_name, tbl.alters);
  END LOOP;
END $$;
