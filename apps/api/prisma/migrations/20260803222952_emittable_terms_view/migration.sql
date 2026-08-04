-- THE K-ANONYMITY FLOOR, AS A DATABASE OBJECT.
--
-- Until now the floor was a TypeScript fragment each reader had to remember to
-- apply. That binds only the callers who opt in: a script reading
-- signals.subject_text directly (warm-query-embedding-cache did exactly this,
-- and shipped the terms to a third-party embedding API), an ad-hoc psql query,
-- or any future reader, all bypassed it silently. A convention that must be
-- remembered is not a floor.
--
-- This view is the floor. It answers ONE question — "may this term be spoken
-- at all?" — and it answers it as a GLOBAL property of the term, not as an
-- artifact of the asking query's window or prefix. Demand SCORING stays in the
-- readers; only eligibility lives here. Those were two concerns fused into a
-- single HAVING, which is why the number had to be repeated per site.
--
-- SOURCE is signal_demand_daily, not signals: the aggregate is the durable
-- record (raw signals is becoming short-lived), and it is the same facts.
--
-- ACROSS ALL KINDS, deliberately. A term three people typed is not identifying
-- regardless of which lane it surfaces in; a term one person typed is
-- identifying in every lane. Eligibility is a property of the words.
--
-- A PLAIN VIEW, not materialized: always correct, no refresh to forget. If it
-- ever costs too much, a materialized view is safe in the leak direction
-- (staleness can only WITHHOLD a newly-eligible term, never emit an
-- ineligible one) — but it must then be refreshed on the aggregate's cadence.
CREATE OR REPLACE VIEW signal_emittable_terms AS
  SELECT subject_text AS term
  FROM signal_demand_daily
  WHERE subject_text IS NOT NULL
  GROUP BY subject_text
  HAVING count(DISTINCT actor_id) >= 3;

COMMENT ON VIEW signal_emittable_terms IS
  'K-anonymity floor for free text (SUBJECT_TEXT_K_FLOOR = 3). Terms at least '
  'K distinct people typed. Any read that emits subject_text ACROSS people '
  'must join this; own-actor-scoped reads must not. Enforced repo-wide by the '
  'signals.subject-text-emission invariant.';
