-- Relevance-gate verdict memory becomes CONFIG-SCOPED (P7 docket item 1,
-- 2026-08-17). The gate already computes an honest config discriminator
-- (prompt + placement + serialized caller profile — red-teamed F3/R7), but
-- the primary key was (platform, post_id), so a verdict was permanent: a
-- gate-prompt improvement could never re-hear a dropped post. This is the
-- same pattern the five fingerprint-versioned judge lanes use — the version
-- joins the identity, old verdicts stay as auditable history, and a config
-- bump naturally re-opens every post (~$1 per full city, deliberate).
--
-- Fetch-outcome tombstones ('parent_unfetchable', written by the orphan-
-- parent sweep with a NULL hash) are not LLM judgments and are not
-- config-scoped: they get the sentinel config 'unfetchable'. No such rows
-- exist locally; prod's orphan backlog may hold some, hence the backfill.
--
-- Table is ~9k rows; no whole-table rewrite (no ALTER TYPE), so the
-- parallel-worker guard is not required (AUTHORING.md §1).

UPDATE collection_relevance_verdicts
SET prompt_hash = 'unfetchable'
WHERE prompt_hash IS NULL;

ALTER TABLE collection_relevance_verdicts
  ALTER COLUMN prompt_hash SET NOT NULL;

ALTER TABLE collection_relevance_verdicts
  DROP CONSTRAINT collection_relevance_verdicts_pkey;

ALTER TABLE collection_relevance_verdicts
  ADD PRIMARY KEY (platform, post_id, prompt_hash);
