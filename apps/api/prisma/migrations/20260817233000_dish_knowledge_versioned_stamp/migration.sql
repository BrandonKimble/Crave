-- Dish-knowledge stamps become VERSIONED (P7 docket item 4, 2026-08-17).
-- knowledgeSynthesizedAt alone made a synthesized dish done FOREVER — a
-- prompt improvement could never re-open past syntheses. Every stamp now
-- carries the rule version that produced it (dish-knowledge-rule.ts ledger)
-- and the sweep re-offers rows stamped below the current version.
--
-- Backfill: every already-stamped row was produced under the timestamp-era
-- text, ledgered as version 1 — the value the current text resolves to, so
-- nothing comes due from this move itself (the satisfies-lane precedent).
--
-- ADD COLUMN with no default = no table rewrite (AUTHORING.md §1); the
-- UPDATE is WHERE-narrowed to stamped items.

ALTER TABLE core_entities
  ADD COLUMN knowledge_prompt_version integer;

UPDATE core_entities
SET knowledge_prompt_version = 1
WHERE knowledge_synthesized_at IS NOT NULL;
