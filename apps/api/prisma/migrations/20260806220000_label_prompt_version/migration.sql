-- Prompt-version watermark for the vocabulary sweep (concept-graph §9.2).
-- Existing labels default 1 (pre-gender-complete prompt); the sweep re-offers
-- any label below the generator's current version — bounded to one re-pay per
-- prompt bump, so "the prompt improved" re-covers the corpus automatically.
-- Plain nullable-free ADD with constant default: no table rewrite hazard.
ALTER TABLE entity_labels ADD COLUMN prompt_version integer NOT NULL DEFAULT 1;
