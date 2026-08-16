-- duration_ms: wall-clock latency of the vendor call, in milliseconds.
-- Added for the first-search sync-hearing budget (foundation red team #7,
-- 2026-08-16): the bounded await's timeout T must be a MEASURED p95 of the
-- vocabulary judge's single-batch latency, and the no-fake-estimates law
-- forbids inventing that number — so the ledger grows the dimension that
-- makes it measurable. Nullable, additive, no rewrite (PG stores no default),
-- so no parallel-worker guard is needed (AUTHORING.md §1).
ALTER TABLE "api_usage_ledger" ADD COLUMN "duration_ms" INTEGER;
