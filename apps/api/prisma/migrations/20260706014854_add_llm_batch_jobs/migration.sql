-- Gemini Batch API job tracking (see LlmBatchJob/LlmBatchJobItem).
CREATE TABLE "llm_batch_jobs" (
    "job_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purpose" VARCHAR(64) NOT NULL,
    "model" VARCHAR(128) NOT NULL,
    "provider_job_name" VARCHAR(256),
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "request_count" INTEGER NOT NULL,
    "resume_context" JSONB,
    "error" TEXT,
    "submitted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "ingested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "llm_batch_jobs_pkey" PRIMARY KEY ("job_id")
);
CREATE INDEX "idx_llm_batch_jobs_status" ON "llm_batch_jobs"("status");
CREATE TABLE "llm_batch_job_items" (
    "job_id" UUID NOT NULL,
    "item_index" INTEGER NOT NULL,
    "item_key" VARCHAR(256) NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB,
    "error" TEXT,
    CONSTRAINT "llm_batch_job_items_pkey" PRIMARY KEY ("job_id","item_index"),
    CONSTRAINT "llm_batch_job_items_job_fkey" FOREIGN KEY ("job_id")
      REFERENCES "llm_batch_jobs"("job_id") ON DELETE CASCADE
);
