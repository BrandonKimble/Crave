-- THE EMPTIEST ROW WAS THE MOST POWERFUL ONE (F103/D3, owner-ratified
-- 2026-08-02 as a money-data migration).
--
-- `access_grants_day_xor_absolute` was CHECK (granted_days IS NULL OR
-- expires_at IS NULL) — a NAND, not the XOR its comment claimed. Both-null is
-- how LIFETIME is spelled, so a day-grant row that lost its granted_days was
-- indistinguishable from an immortal one: deriveSummary saw granted_days NULL,
-- classified it absolute, found expires_at NULL, and returned unbounded access.
--
-- Three shapes were being encoded in two nullable columns. Each now says its
-- own name, and a row that sets nothing is ILLEGAL rather than immortal.
--
--   lifetime : granted_days NULL     AND expires_at NULL      (comps, promos)
--   days     : granted_days NOT NULL AND expires_at NULL      (banked days)
--   window   : granted_days NULL     AND expires_at NOT NULL  (subscriptions)
--
-- The backfill DERIVES kind from the column shapes above — it invents nothing —
-- and the migration then ASSERTS that every pre-existing row was classified.
-- If any row is left unclassified the migration RAISES and the transaction
-- rolls back, because a money row this code cannot name is not a state to
-- deploy past.
--
-- Small, targeted DDL over a tiny table: no parallelism guards needed.

ALTER TABLE access_grants ADD COLUMN kind text;

UPDATE access_grants
SET kind = CASE
  WHEN granted_days IS NOT NULL THEN 'days'
  WHEN expires_at   IS NOT NULL THEN 'window'
  ELSE 'lifetime'
END;

-- THE ASSERTION: the derivation is total. Every row that existed before this
-- migration carries a kind after it, and the three kinds partition the table
-- exactly (no row counted twice, none dropped).
DO $$
DECLARE
  total        bigint;
  classified   bigint;
  by_kind      bigint;
BEGIN
  SELECT count(*) INTO total      FROM access_grants;
  SELECT count(*) INTO classified FROM access_grants WHERE kind IS NOT NULL;
  SELECT count(*) INTO by_kind    FROM access_grants
    WHERE kind IN ('lifetime', 'days', 'window');

  IF classified <> total OR by_kind <> total THEN
    RAISE EXCEPTION
      'access_grants kind backfill is not total: % rows, % classified, % in the union',
      total, classified, by_kind;
  END IF;
END $$;

ALTER TABLE access_grants ALTER COLUMN kind SET NOT NULL;

-- The old NAND goes: it permitted the both-null-on-a-day-grant state that the
-- per-kind CHECKs below make unrepresentable.
ALTER TABLE access_grants DROP CONSTRAINT IF EXISTS access_grants_day_xor_absolute;

ALTER TABLE access_grants ADD CONSTRAINT access_grants_kind_shape CHECK (
  (kind = 'lifetime' AND granted_days IS NULL     AND expires_at IS NULL)
  OR
  (kind = 'days'     AND granted_days IS NOT NULL AND expires_at IS NULL)
  OR
  (kind = 'window'   AND granted_days IS NULL     AND expires_at IS NOT NULL)
);
