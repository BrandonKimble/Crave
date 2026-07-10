-- Lease for in-flight batch-job claims (submitting/ingesting): a live worker
-- heartbeats this forward; an expired lease means the worker died and any
-- poller may reclaim. NULL outside claimed states.
ALTER TABLE "llm_batch_jobs" ADD COLUMN "lease_expires_at" TIMESTAMP(3);
