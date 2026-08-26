-- OBSERVED-SPAN CONTRACT REFUSALS (v17, plans/v17-coherence-redteam F8).
-- A mention whose place_observed fails the mechanical span-in-cited-source
-- check at ingest is REFUSED and banked here — run id, provenance ids, the
-- raw mention JSON, and the failure reason — never silently dropped. The
-- shadow diff's refusal section reads this table before any activation.
-- Hand-authored (agents never run `prisma migrate dev`). New empty table:
-- no heavy statements, no parallel-worker guard needed (AUTHORING.md §1).

CREATE TABLE "collection_extraction_contract_refusals" (
    "refusal_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "extraction_run_id" UUID NOT NULL,
    "input_id" UUID,
    "source_document_id" UUID,
    "reason" VARCHAR(64) NOT NULL,
    "detail" TEXT,
    "mention" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_extraction_contract_refusals_pkey" PRIMARY KEY ("refusal_id")
);

CREATE INDEX "idx_extraction_contract_refusals_run"
    ON "collection_extraction_contract_refusals"("extraction_run_id");

CREATE INDEX "idx_extraction_contract_refusals_reason"
    ON "collection_extraction_contract_refusals"("reason");

ALTER TABLE "collection_extraction_contract_refusals"
    ADD CONSTRAINT "collection_extraction_contract_refusals_extraction_run_id_fkey"
    FOREIGN KEY ("extraction_run_id")
    REFERENCES "collection_extraction_runs"("extraction_run_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
