-- VERSIONED PROMPTS (2026-08-01): the prompt becomes runtime data, not a
-- deploy asset. Live collection keeps extracting with the ACTIVE version
-- while candidate versions run shadow replays — prompt iteration no longer
-- pauses collection (kills the 74-day delta clock and the prompt-hash
-- coverage trap: activation is an explicit governed event).
CREATE TABLE "llm_prompts" (
    "prompt_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'candidate',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),
    CONSTRAINT "llm_prompts_pkey" PRIMARY KEY ("prompt_id"),
    CONSTRAINT "llm_prompts_status_check"
      CHECK ("status" IN ('candidate', 'active', 'retired'))
);

CREATE UNIQUE INDEX "llm_prompts_kind_version_key" ON "llm_prompts"("kind", "version");
-- exactly one active version per kind
CREATE UNIQUE INDEX "llm_prompts_kind_active_key" ON "llm_prompts"("kind") WHERE "status" = 'active';
