-- Create lightweight source ledger for duplicate prevention
CREATE TABLE "source" (
    "pipeline" VARCHAR(32) NOT NULL,
    "source_id" VARCHAR(64) NOT NULL,
    "subreddit" VARCHAR(100),
    "processed_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "source_pkey" PRIMARY KEY ("pipeline", "source_id")
);

CREATE INDEX "idx_source_pipeline" ON "source" ("pipeline");
CREATE INDEX "idx_source_subreddit" ON "source" ("subreddit");
CREATE INDEX "idx_source_processed_at" ON "source" ("processed_at" DESC);
