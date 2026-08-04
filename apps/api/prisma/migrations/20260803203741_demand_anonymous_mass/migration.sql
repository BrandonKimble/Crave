-- THE STATISTIC THAT CANNOT BE RECOMPUTED LATER.
--
-- `demand-mass.reader` computes SUM(ln(1 + acts_by_that_actor) / ln(2)) — a
-- SUB-LINEAR PER-ACTOR weighting whose whole purpose is that one heavy user
-- cannot dominate demand. That number is not derivable from a total act count
-- and a distinct-actor count: 100 acts from 1 person and 1 act from 100 people
-- have identical totals and wildly different mass.
--
-- The actor dimension does not survive promotion — that is the point of
-- promotion. So every statistic DERIVED from it has to be computed while it
-- still exists, or it is lost forever. Repointing demand-mass at a table
-- without this column would have silently replaced the anti-domination
-- weighting with a raw sum, and nothing would have failed.
--
-- The value is an anonymous scalar: it says how much weighted demand exists,
-- never who supplied it.
ALTER TABLE signal_demand_anonymous
  ADD COLUMN IF NOT EXISTS demand_mass DOUBLE PRECISION NOT NULL DEFAULT 0;

COMMENT ON COLUMN signal_demand_anonymous.demand_mass IS
  'SUM(ln(1+acts_per_actor)/ln(2)) computed at promotion. Anonymous, and NOT recomputable from act_count + distinct_actors.';
