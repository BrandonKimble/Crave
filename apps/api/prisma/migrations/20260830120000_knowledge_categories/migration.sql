-- D4 category move (hand-authored, 2026-08-30).
--
-- core_entities.knowledge_categories: the dish-knowledge pass's category
-- facet — canonical item-entity ids of the broader orderable dish classes
-- the dish NAME itself rolls up into ("carnitas taco" -> taco). Versioned
-- by the existing knowledge_prompt_version ledger stamp, exactly like
-- knowledge_cuisines (S4). derived_food_category_edges is re-derived from
-- THIS column (once per dish concept) instead of reconciling the noisy
-- per-connection `categories` arrays (60.3% cross-mention disagreement,
-- plans/category-and-knowledge-split-study.md).
--
-- Plain ADD COLUMN with a non-volatile default — no table rewrite
-- (AUTHORING.md §1, measured 2026-08-09), no parallel-worker guard needed.

ALTER TABLE "core_entities"
  ADD COLUMN "knowledge_categories" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
