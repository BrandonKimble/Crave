-- PLACE-GRAIN ANONYMOUS DEMAND.
--
-- Why a second table rather than a column on the first: THE ROW GRAIN DECIDES
-- WHICH PER-ACTOR STATISTICS ARE COMPUTABLE, and the two consumers need
-- different grains.
--
--   signal_demand_anonymous       (day, place, kind, subject) - subject demand
--   signal_place_demand_anonymous (day, place)                - place mass
--
-- `demand-mass.reader` collapses ALL of an actor's acts for a place before
-- applying ln(1+acts). Deriving that from subject-grain rows is not merely
-- inconvenient, it is WRONG: ln is concave, so splitting one actor's acts
-- across subjects and summing inflates the result. Measured on the local
-- corpus: max per-place error 102.35 — a silent, unbounded distortion of the
-- number that decides which places get polls.
--
-- The lesson, stated once so it is not relearned: an aggregate is only
-- anonymous AND correct if it is computed at the grain its consumer asks
-- about, while the actor dimension still exists. After promotion it is gone.
CREATE TABLE IF NOT EXISTS signal_place_demand_anonymous (
  row_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day             date             NOT NULL,
  place_id        uuid             NOT NULL,
  distinct_actors integer          NOT NULL,
  act_count       bigint           NOT NULL,
  demand_mass     double precision NOT NULL,
  computed_at     timestamptz      NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_place_demand_anon_key
  ON signal_place_demand_anonymous (day, place_id);
CREATE INDEX IF NOT EXISTS idx_place_demand_anon_place
  ON signal_place_demand_anonymous (place_id, day);

COMMENT ON TABLE signal_place_demand_anonymous IS
  'Place-grain anonymous demand. No actor column. demand_mass = SUM(ln(1+acts_per_actor)/ln(2)) with the actor collapsed across ALL subjects for the place — the grain demand-mass.reader actually asks about.';
