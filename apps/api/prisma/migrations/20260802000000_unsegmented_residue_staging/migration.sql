-- STEP-2 / zero-per-search-LLM staging zone (search-from-scratch spec §1.1):
-- raw ungrounded residue cannot enter collection_on_demand_requests
-- (entity_type NOT NULL); it lands here and the async batch segmenter
-- drains it into typed queue rows.
CREATE TABLE "collection_on_demand_unsegmented_residue" (
    "residue_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "residue_text" VARCHAR(500) NOT NULL,
    "search_request_id" VARCHAR(64),
    "engine_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "context" JSONB DEFAULT '{}',
    "user_id" UUID,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "collection_on_demand_unsegmented_residue_pkey" PRIMARY KEY ("residue_id")
);

CREATE INDEX "idx_unsegmented_residue_status" ON "collection_on_demand_unsegmented_residue"("status", "created_at");
