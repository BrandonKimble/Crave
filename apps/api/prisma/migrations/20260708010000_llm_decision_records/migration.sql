CREATE TABLE "llm_decision_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" VARCHAR(32) NOT NULL,
    "input" JSONB NOT NULL,
    "decision" JSONB NOT NULL,
    "model" VARCHAR(128) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "llm_decision_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_llm_decisions_kind_created" ON "llm_decision_records"("kind", "created_at");
