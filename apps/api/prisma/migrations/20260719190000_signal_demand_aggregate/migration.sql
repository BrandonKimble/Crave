-- §22 item 6: the signals demand AGGREGATE (§3: day × actor × place × subject
-- × kind) — a derived read model over the append-only signals ledger.
-- Rebuildable from scratch at any time; recent days rebuild incrementally
-- (whole-day delete-and-reinsert under an advisory lock). place_id NULL is the
-- GLOBAL tile (every signal exactly once); non-NULL rows are weight-1
-- attribution to every place whose bbox intersects the signal geo (wrap-aware
-- longitude: min_lng > max_lng crosses the antimeridian).

CREATE TABLE signal_demand_daily (
    row_id           uuid NOT NULL DEFAULT gen_random_uuid(),
    day              date NOT NULL,
    place_id         uuid,
    actor_id         uuid NOT NULL,
    kind             varchar(32) NOT NULL,
    subject_type     varchar(16) NOT NULL,
    subject_id       uuid,
    subject_text     varchar(255),
    signal_count     integer NOT NULL,
    last_occurred_at timestamptz NOT NULL,

    CONSTRAINT signal_demand_daily_pkey PRIMARY KEY (row_id)
);

CREATE INDEX "SignalDemandDaily_day_idx" ON signal_demand_daily (day);
CREATE INDEX "SignalDemandDaily_subjectId_day_idx" ON signal_demand_daily (subject_id, day);
CREATE INDEX "SignalDemandDaily_subjectText_day_idx" ON signal_demand_daily (subject_text, day);
CREATE INDEX "SignalDemandDaily_actorId_day_idx" ON signal_demand_daily (actor_id, day);
CREATE INDEX "SignalDemandDaily_placeId_day_idx" ON signal_demand_daily (place_id, day);

-- Per-actor reader lane on the ledger itself (recently-viewed, recent
-- searches): one actor's acts of one kind, newest-first.
CREATE INDEX "Signal_actorId_kind_occurredAt_idx" ON signals (actor_id, kind, occurred_at);
