-- §3 signals ledger: monthly RANGE partitions on occurred_at (the plan says
-- "append-only, IMMUTABLE, permanent, monthly partitions" — the table was
-- plain until this leg). Strategy: rename old table → create partitioned
-- parent with identical columns/defaults + partitioned indexes → copy rows →
-- verify count → drop old. All indexes (incl. the partial dedupe EXPRESSION
-- index, red-team 1c) are recreated as PARTITIONED indexes on the parent so
-- every partition inherits them.
BEGIN;

ALTER TABLE signals RENAME TO signals_unpartitioned_old;
ALTER INDEX signals_pkey RENAME TO signals_pkey_old;
ALTER INDEX "Signal_actorId_kind_occurredAt_idx" RENAME TO "Signal_actorId_kind_occurredAt_idx_old";
ALTER INDEX "Signal_dedupeRequestId_occurredAt_idx" RENAME TO "Signal_dedupeRequestId_occurredAt_idx_old";
ALTER INDEX "Signal_recordedAt_idx" RENAME TO "Signal_recordedAt_idx_old";
ALTER INDEX signals_kind_occurred_at_idx RENAME TO signals_kind_occurred_at_idx_old;
ALTER INDEX signals_occurred_at_idx RENAME TO signals_occurred_at_idx_old;
ALTER INDEX signals_subject_id_idx RENAME TO signals_subject_id_idx_old;

-- The partitioned parent. PK must include the partition key (Postgres law for
-- unique constraints on partitioned tables): (signal_id, occurred_at).
-- signal_id stays globally unique in practice (gen_random_uuid()).
CREATE TABLE signals (
  signal_id    uuid NOT NULL DEFAULT gen_random_uuid(),
  kind         varchar(32) NOT NULL,
  subject_type varchar(16) NOT NULL,
  subject_id   uuid,
  subject_text varchar(255),
  geo_min_lat  numeric(10,8) NOT NULL,
  geo_min_lng  numeric(11,8) NOT NULL,
  geo_max_lat  numeric(10,8) NOT NULL,
  geo_max_lng  numeric(11,8) NOT NULL,
  actor_id     uuid NOT NULL,
  occurred_at  timestamp(3) NOT NULL,
  meta         jsonb,
  recorded_at  timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT signals_pkey PRIMARY KEY (signal_id, occurred_at)
) PARTITION BY RANGE (occurred_at);

-- Historic catch-all (anything before the ledger existed / clock-skewed past
-- writes): permanent, bounded above by the first real month.
CREATE TABLE signals_p_pre PARTITION OF signals
  FOR VALUES FROM (MINVALUE) TO ('2026-06-01 00:00:00');
CREATE TABLE signals_p2026_06 PARTITION OF signals
  FOR VALUES FROM ('2026-06-01 00:00:00') TO ('2026-07-01 00:00:00');
CREATE TABLE signals_p2026_07 PARTITION OF signals
  FOR VALUES FROM ('2026-07-01 00:00:00') TO ('2026-08-01 00:00:00');
CREATE TABLE signals_p2026_08 PARTITION OF signals
  FOR VALUES FROM ('2026-08-01 00:00:00') TO ('2026-09-01 00:00:00');
CREATE TABLE signals_p2026_09 PARTITION OF signals
  FOR VALUES FROM ('2026-09-01 00:00:00') TO ('2026-10-01 00:00:00');
CREATE TABLE signals_p2026_10 PARTITION OF signals
  FOR VALUES FROM ('2026-10-01 00:00:00') TO ('2026-11-01 00:00:00');

-- Partitioned indexes (same names as before — Prisma maps are unchanged).
CREATE INDEX signals_occurred_at_idx ON signals (occurred_at);
CREATE INDEX signals_kind_occurred_at_idx ON signals (kind, occurred_at);
CREATE INDEX signals_subject_id_idx ON signals (subject_id);
CREATE INDEX "Signal_actorId_kind_occurredAt_idx" ON signals (actor_id, kind, occurred_at);
CREATE INDEX "Signal_recordedAt_idx" ON signals (recorded_at);
-- Red-team 1c dedupe probe: partial EXPRESSION index — partitioned indexes
-- support both (each partition gets its own physical partial index).
CREATE INDEX "Signal_dedupeRequestId_occurredAt_idx" ON signals (
  (COALESCE(meta->>'searchRequestId', meta->>'cacheRevealRequestId')),
  occurred_at
) WHERE (meta->>'searchRequestId') IS NOT NULL
   OR (meta->>'cacheRevealRequestId') IS NOT NULL;

INSERT INTO signals SELECT * FROM signals_unpartitioned_old;

-- Row-count invariant: every existing signal survives, or the tx aborts.
DO $$
DECLARE
  old_count bigint;
  new_count bigint;
BEGIN
  SELECT count(*) INTO old_count FROM signals_unpartitioned_old;
  SELECT count(*) INTO new_count FROM signals;
  IF old_count IS DISTINCT FROM new_count THEN
    RAISE EXCEPTION 'signals partition copy mismatch: old=% new=%', old_count, new_count;
  END IF;
END $$;

DROP TABLE signals_unpartitioned_old;

COMMIT;
