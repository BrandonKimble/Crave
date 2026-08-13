-- THE HEARING LEDGER (architecture red team H5, 2026-08-12).
--
-- Every lane that convenes a hearing — word claims today, dedupe and
-- satisfies behind the same adapter later — writes ONE row per
-- (lane, claim_key, rule_version). The row is the decision; the corpus
-- mutation is its EFFECT, executed after the decision is durable.
--
-- WHY A TABLE AND NOT A STAMP ON THE AFFECTED ROW. The stamp this replaces
-- (`entity_surface.claim_judge_version`) could only remember a verdict that
-- had a row to land on, which made the memory ASYMMETRIC: a refusal and an
-- eviction wrote a losing row and were remembered, while a GRANT that upheld
-- a claim wrote an ordinary active surface indistinguishable from an
-- unjudged one. A wrong YES was therefore permanent — nothing could re-open
-- it, because nothing recorded that it had been decided at all. Keyed by the
-- claim rather than by the row, both outcomes are one shape, and "no verdict
-- at the current rule version" re-opens grants and losses alike.
--
-- REASON IS NOT OPTIONAL. The judge already returns the rule that decided
-- each case; a verdict whose ground was dropped cannot be audited, so an
-- empty reason is rejected by the database, not by a convention.
--
-- EXECUTED_AT IS THE CRASH SEAM. decided_at commits with the verdict;
-- executed_at is set only once the lane's effect (bank / deprecate /
-- degrade) has actually run. A process that dies between them leaves a
-- decided-but-unexecuted row, which the next run resumes — never a paid
-- hearing whose outcome vanished, never a corpus mutation with no recorded
-- ground.
CREATE TABLE "claim_verdicts" (
    "lane" VARCHAR(32) NOT NULL,
    "claim_key" TEXT NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "outcome" VARCHAR(32) NOT NULL,
    "reason" TEXT NOT NULL,
    "rule_fingerprint" VARCHAR(16),
    "subject" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "executed_at" TIMESTAMPTZ(6),

    CONSTRAINT "claim_verdicts_pkey" PRIMARY KEY ("lane", "claim_key", "rule_version")
);

-- A verdict with no stated ground is not a verdict (amendment (d)).
ALTER TABLE "claim_verdicts"
  ADD CONSTRAINT "claim_verdicts_reason_stated"
  CHECK (btrim("reason") <> '');

-- The resume queue: decided, not yet executed. Partial, because in a healthy
-- corpus it is empty and the index costs nothing.
CREATE INDEX "idx_claim_verdicts_unexecuted"
  ON "claim_verdicts" ("lane", "decided_at")
  WHERE "executed_at" IS NULL;

-- The due-predicate's read path: everything this lane has ever decided about
-- one claim, so "is there a verdict at the current rule version" is an index
-- probe rather than a scan.
CREATE INDEX "idx_claim_verdicts_lane_claim"
  ON "claim_verdicts" ("lane", "claim_key");
