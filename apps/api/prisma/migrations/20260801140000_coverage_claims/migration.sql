-- In-flight extraction reservation (async-integrity step 3, Law 2).
CREATE TABLE collection_extraction_coverage_claims (
  document_id UUID NOT NULL,
  prompt_hash VARCHAR(64) NOT NULL,
  extraction_run_id UUID,
  claimed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT collection_extraction_coverage_claims_pkey
    PRIMARY KEY (document_id, prompt_hash)
);
CREATE INDEX idx_coverage_claims_run
  ON collection_extraction_coverage_claims (extraction_run_id);
