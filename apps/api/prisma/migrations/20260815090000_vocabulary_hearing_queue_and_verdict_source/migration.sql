-- A1 + A2/A3 (2026-08-15): the hearing backlog becomes durable, and a verdict
-- records WHO bought it so the standing allowance can meter the unattended
-- trickle without being permanently exhausted by a one-time bulk certification.

ALTER TABLE "claim_verdicts"
  ADD COLUMN "source" VARCHAR(16) NOT NULL DEFAULT 'steady';

-- Every verdict in the table today was bought by the one-time bulk
-- certification runs of 2026-08-13/14 (there was no other caller: drainPending
-- had none). Marking them for what they were is what stops the rolling window
-- from reading 97,400 hearings of "ordinary trickle" and refusing every real
-- one. Backfill is by fact, not by guess.
UPDATE "claim_verdicts" SET "source" = 'certification';

CREATE INDEX "idx_claim_verdicts_lane_source_decided"
  ON "claim_verdicts" ("lane", "source", "decided_at");

CREATE TABLE "vocabulary_hearing_queue" (
  "lane"      VARCHAR(32) NOT NULL,
  "claim_key" TEXT NOT NULL,
  "word"      TEXT NOT NULL,
  "locale"    VARCHAR(16) NOT NULL,
  "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vocabulary_hearing_queue_pkey" PRIMARY KEY ("lane", "claim_key")
);

CREATE INDEX "idx_vocabulary_hearing_queue_queued"
  ON "vocabulary_hearing_queue" ("queued_at");
