-- Red-team fixes on the §3 signals aggregate (commit d0764df3):
--
-- 1b. Watermark-driven rebuild: signals gains recorded_at (WHEN the ledger
--     learned of the act — occurred_at is when the act happened; offline
--     queues and backfills can record an act days later). Each aggregate
--     cron pass rebuilds every day that has ledger rows recorded since the
--     last watermark, so ANY signal, whenever recorded, eventually lands in
--     its day slice. Existing rows default to now(): the first watermark
--     pass therefore rebuilds every day the ledger touches, exactly once.
ALTER TABLE signals
  ADD COLUMN recorded_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX "Signal_recordedAt_idx" ON signals (recorded_at);

-- Single-row watermark state for the aggregate rebuild cron.
CREATE TABLE signal_demand_rebuild_state (
    id         integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    watermark  timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1c. Ledger-wide retry dedupe: when rebuilding day D, a request-id that
--     already occurred on an earlier day is excluded (first occurrence
--     wins). This partial expression index makes that anti-join one probe.
CREATE INDEX "Signal_dedupeRequestId_occurredAt_idx" ON signals (
  (COALESCE(meta->>'searchRequestId', meta->>'cacheRevealRequestId')),
  occurred_at
) WHERE meta->>'searchRequestId' IS NOT NULL
     OR meta->>'cacheRevealRequestId' IS NOT NULL;

-- 3b. Geo index for the rebuild's containment attribution (§3): a GiST
--     envelope index over non-crossing place bboxes. The rebuild probes it
--     twice per distinct signal geo (containing-place lookup + contained-
--     tiling lookup); antimeridian-crossing places (bbox_min_lng >
--     bbox_max_lng) are excluded here and handled by explicit wrap branches
--     over that (tiny) set.
CREATE INDEX "Place_bbox_envelope_gist_idx" ON places USING gist (
  (ST_MakeEnvelope(
    bbox_min_lng::float8, bbox_min_lat::float8,
    bbox_max_lng::float8, bbox_max_lat::float8, 4326))
) WHERE bbox_min_lat IS NOT NULL AND bbox_min_lng <= bbox_max_lng;
