-- THE LAST NAIVE TIMESTAMP. signals.occurred_at becomes timestamptz.
--
-- The 20260802060000 migration converted 161 columns and could not touch this
-- one: it is the RANGE partition key, and Postgres refuses
-- ("cannot alter column ... because it is part of the partition key"). That
-- left one column, one helper (signals/sql-instant.ts), and five call sites
-- carrying a whole bug class — and a sixth call site that had quietly skipped
-- the helper and read a different number under every non-UTC session timezone
-- (measured: 601 rows UTC, 613 America/Chicago, 574 Asia/Tokyo).
--
-- Postgres cannot alter the key, but nothing stops us from building the table
-- we should have had and moving the rows into it. Measured before writing
-- this: 824 rows / ~1 MB in production. The "risky rewrite" this was deferred
-- for does not exist at this size.
--
-- The stored values are naive UTC wall-clock, so `AT TIME ZONE 'UTC'` is the
-- exact, lossless reading of what they already mean.
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

-- 1. The table as it should be. Built alongside under a temporary name so the
--    canonical index and constraint names are free to take at the end.
CREATE TABLE "signals_tt" (
  "signal_id"    uuid           NOT NULL DEFAULT gen_random_uuid(),
  "kind"         varchar(32)    NOT NULL,
  "subject_type" varchar(16)    NOT NULL,
  "subject_id"   uuid,
  "subject_text" varchar(255),
  "geo_min_lat"  numeric(10,8),
  "geo_min_lng"  numeric(11,8),
  "geo_max_lat"  numeric(10,8),
  "geo_max_lng"  numeric(11,8),
  "actor_id"     uuid           NOT NULL,
  "occurred_at"  timestamptz(3) NOT NULL,
  "meta"         jsonb,
  "recorded_at"  timestamptz(6) NOT NULL DEFAULT now(),
  "place_id"     uuid,
  CONSTRAINT "signals_tt_pkey" PRIMARY KEY ("signal_id", "occurred_at"),
  CONSTRAINT "signals_tt_where_shape_check" CHECK (
    "place_id" IS NOT NULL
    OR ("geo_min_lat" IS NOT NULL AND "geo_min_lng" IS NOT NULL
        AND "geo_max_lat" IS NOT NULL AND "geo_max_lng" IS NOT NULL)
  )
) PARTITION BY RANGE ("occurred_at");

-- 2. Partitions. EVERY BOUND CARRIES +00, AND THAT IS LOAD-BEARING.
--    A bound literal without an offset is resolved in the SESSION TimeZone at
--    DDL time, so the same statement run on a laptop in America/Chicago would
--    build partitions shifted six hours from production's — the identical bug
--    this migration exists to end, relocated from the query into the schema.
CREATE TABLE "signals_tt_p_pre"    PARTITION OF "signals_tt" FOR VALUES FROM (MINVALUE)                  TO ('2026-06-01 00:00:00+00');
CREATE TABLE "signals_tt_p2026_06" PARTITION OF "signals_tt" FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');
CREATE TABLE "signals_tt_p2026_07" PARTITION OF "signals_tt" FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');
CREATE TABLE "signals_tt_p2026_08" PARTITION OF "signals_tt" FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');
CREATE TABLE "signals_tt_p2026_09" PARTITION OF "signals_tt" FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
CREATE TABLE "signals_tt_p2026_10" PARTITION OF "signals_tt" FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

-- 3. Copy. `AT TIME ZONE 'UTC'` reads a naive timestamp AS a UTC instant —
--    the lossless statement of what these values already meant.
INSERT INTO "signals_tt" (
  "signal_id", "kind", "subject_type", "subject_id", "subject_text",
  "geo_min_lat", "geo_min_lng", "geo_max_lat", "geo_max_lng",
  "actor_id", "occurred_at", "meta", "recorded_at", "place_id"
)
SELECT
  "signal_id", "kind", "subject_type", "subject_id", "subject_text",
  "geo_min_lat", "geo_min_lng", "geo_max_lat", "geo_max_lng",
  "actor_id", "occurred_at" AT TIME ZONE 'UTC', "meta", "recorded_at", "place_id"
FROM "signals";

-- 4. Refuse to continue on a short copy. A partition-bound mismatch would
--    surface as an insert error, but a silent row loss must not be possible.
DO $$
DECLARE old_count bigint; new_count bigint;
BEGIN
  SELECT count(*) INTO old_count FROM "signals";
  SELECT count(*) INTO new_count FROM "signals_tt";
  IF old_count <> new_count THEN
    RAISE EXCEPTION 'signals copy lost rows: % -> %', old_count, new_count;
  END IF;
END $$;

-- 5. Swap.
DROP TABLE "signals" CASCADE;
ALTER TABLE "signals_tt" RENAME TO "signals";
ALTER TABLE "signals_tt_p_pre"    RENAME TO "signals_p_pre";
ALTER TABLE "signals_tt_p2026_06" RENAME TO "signals_p2026_06";
ALTER TABLE "signals_tt_p2026_07" RENAME TO "signals_p2026_07";
ALTER TABLE "signals_tt_p2026_08" RENAME TO "signals_p2026_08";
ALTER TABLE "signals_tt_p2026_09" RENAME TO "signals_p2026_09";
ALTER TABLE "signals_tt_p2026_10" RENAME TO "signals_p2026_10";
ALTER INDEX "signals_tt_pkey" RENAME TO "signals_pkey";
ALTER TABLE "signals" RENAME CONSTRAINT "signals_tt_where_shape_check" TO "signals_where_shape_check";

-- 6. Indexes, recreated on the parent (Postgres propagates to every
--    partition, including ones the maintenance cron adds later).
CREATE INDEX "Signal_actorId_kind_occurredAt_idx" ON "signals" ("actor_id", "kind", "occurred_at");
CREATE INDEX "Signal_dedupeRequestId_occurredAt_idx" ON "signals" (
  COALESCE("meta"->>'searchRequestId', "meta"->>'cacheRevealRequestId'), "occurred_at"
) WHERE ("meta"->>'searchRequestId') IS NOT NULL OR ("meta"->>'cacheRevealRequestId') IS NOT NULL;
CREATE INDEX "Signal_recordedAt_idx" ON "signals" ("recorded_at");
CREATE INDEX "idx_signals_place_id" ON "signals" ("place_id") WHERE "place_id" IS NOT NULL;
CREATE INDEX "signals_kind_occurred_at_idx" ON "signals" ("kind", "occurred_at");
CREATE INDEX "signals_occurred_at_idx" ON "signals" ("occurred_at");
CREATE INDEX "signals_subject_id_idx" ON "signals" ("subject_id");

-- 7. Child index names inherit the temporary prefix from the partition rename;
--    rename them so the schema reads as though it had always been this way.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS name FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND n.nspname = current_schema()
      AND c.relname LIKE 'signals\_tt%'
  LOOP
    EXECUTE format(
      'ALTER INDEX %I RENAME TO %I',
      r.name, replace(r.name, 'signals_tt', 'signals')
    );
  END LOOP;
END $$;
