-- PROMPT CONTENT HAS ONE HOME (2026-08-01 collapse audit): extraction runs
-- stored the full ~79KB prompt text per row (137 rows / 6 distinct prompts
-- / ~10MB on prod, zero readers). The registry (llm_prompts) is the single
-- content store; runs keep system_prompt_hash as the content-addressed
-- join key. Historical prompt texts are preserved by backfilling each
-- distinct one into the registry as a RETIRED version before the column
-- drops — no provenance is lost.

INSERT INTO llm_prompts (kind, version, content, content_hash, status, notes)
SELECT
  'collection_system',
  (SELECT COALESCE(MAX(version), 0) FROM llm_prompts WHERE kind = 'collection_system')
    + ROW_NUMBER() OVER (ORDER BY first_used),
  content,
  content_hash,
  'retired',
  'backfilled from collection_extraction_runs (first used ' || first_used::date || ')'
FROM (
  SELECT DISTINCT ON (system_prompt_hash)
    system_prompt AS content,
    system_prompt_hash AS content_hash,
    min(started_at) OVER (PARTITION BY system_prompt_hash) AS first_used
  FROM collection_extraction_runs
  WHERE system_prompt IS NOT NULL
) h
WHERE NOT EXISTS (
  SELECT 1 FROM llm_prompts p
  WHERE p.kind = 'collection_system' AND p.content_hash = h.content_hash
);

ALTER TABLE "collection_extraction_runs" DROP COLUMN "system_prompt";
