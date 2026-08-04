-- Replace the daily place table with a WINDOW SNAPSHOT.
--
-- Why daily was wrong: `demand-mass.reader` collapses ALL of an actor's acts
-- for a place across the WHOLE horizon before applying ln(1+acts). Summing
-- per-day masses is not the same number — ln is concave, so slicing by day
-- inflates it. Measured: max per-place error 41.26 with daily rows, 102.35
-- with subject-grain rows. Both silent.
--
-- A non-linear per-actor statistic over a window simply cannot be recovered
-- from finer-grained anonymous rows. It has to be computed AT the window, so
-- the window is what this table stores. The horizon is a DERIVED constant
-- (RECENCY_FLAT_DAYS + 10 half-lives = 147d, poll-supply.constants.ts), not a
-- free parameter, which is exactly why a fixed snapshot is legitimate here.
DROP TABLE IF EXISTS signal_place_demand_anonymous;

CREATE TABLE signal_place_demand_anonymous (
  place_id        uuid             PRIMARY KEY,
  window_days     integer          NOT NULL,
  distinct_actors integer          NOT NULL,
  act_count       bigint           NOT NULL,
  demand_mass     double precision NOT NULL,
  computed_at     timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX idx_place_demand_snapshot_mass
  ON signal_place_demand_anonymous (demand_mass DESC);

COMMENT ON TABLE signal_place_demand_anonymous IS
  'Anonymous place demand over the fixed kernel horizon. No actor column. demand_mass = SUM(ln(1+acts_per_actor)/ln(2)) with the actor collapsed across the WHOLE window — the only grain at which that number is correct.';
