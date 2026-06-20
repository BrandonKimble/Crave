-- Phase 5C: close-time poll graduation marker.
-- `graduated_at` records when a closed poll's thread was run through the
-- authoritative collection pipeline (Gemini extraction -> resolution -> evidence
-- ledger) as a `poll-thread` source. NULL = not yet graduated (the lifecycle cron
-- picks these up, including closed-but-ungraduated retries).
ALTER TABLE "polls" ADD COLUMN "graduated_at" TIMESTAMP(3);
