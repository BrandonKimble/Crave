-- RETIRED (2026-08-03): the parallel anonymous demand tables.
--
-- They were built to enforce a k-anonymity floor on free text by grouping the
-- actor away entirely. That is fatal rather than strong: the demand algebra is
-- DEFINED per actor (mass = sum over actors of log2(1 + acts)), so a table with
-- no actor column cannot compute it — it can only store a mass baked at
-- promotion time, silently freezing the recency kernel, kind weights,
-- echo-kind exclusion, place lineage and window into a number that disagreed
-- with demand-mass.reader on every axis, with nothing failing.
--
-- The concern was always about ONE COLUMN (subject_text), not the ledger. It
-- now lives in signals/subject-text-floor.ts, applied as a HAVING at the two
-- reads that project text ACROSS people. Deletion of a person's demand data
-- was never served by these tables either: it is the declared disposition in
-- person-data-class (sever signal_actors.user_id, null the text columns).
DROP TABLE IF EXISTS signal_place_demand_anonymous;
DROP TABLE IF EXISTS signal_demand_anonymous;
