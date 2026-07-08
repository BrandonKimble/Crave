CREATE TABLE "collection_relevance_verdicts" (
    "platform" VARCHAR(32) NOT NULL,
    "post_id" VARCHAR(64) NOT NULL,
    "keep" BOOLEAN NOT NULL,
    "reason" VARCHAR(256),
    "model" VARCHAR(128) NOT NULL,
    "judged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collection_relevance_verdicts_pkey" PRIMARY KEY ("platform", "post_id")
);
CREATE INDEX "idx_relevance_verdicts_keep" ON "collection_relevance_verdicts"("keep");
