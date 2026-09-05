-- A PROMPT VERSION'S CONTRACT IS (content, response schema) — and a row must
-- remember WHICH schema it was pushed under (v24 rederivation, 2026-09-05).
--
-- content_hash folds the schema into one fingerprint, so a schema edit in
-- the code made every earlier row unverifiable: the registry refused to
-- serve the active v22 the moment the v24 worksheet block shipped, and no
-- schema change could ever be shadowed (the shadow needs the new schema on
-- the worker; the worker refused to boot on the old active row). Two
-- columns split the two facts: content_sha (integrity of the text alone)
-- and schema_hash (the schema the row was pushed under). A row whose
-- schema_hash differs from the running code's is a PRIOR CONTRACT — servable
-- as history, never as the live extraction prompt. NULL schema_hash = a
-- pre-fold row whose schema is unknowable (tolerated with a warning).
--
-- llm_prompts holds a few dozen rows; the UPDATE is not heavy, the guard is
-- the repo's standing rule for any WHERE-less UPDATE.
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

ALTER TABLE "llm_prompts"
  ADD COLUMN "content_sha" VARCHAR(64),
  ADD COLUMN "schema_hash" VARCHAR(64);

UPDATE "llm_prompts" SET "content_sha" = encode(sha256(convert_to("content", 'UTF8')), 'hex');
