-- S4 knowledge wiring (hand-authored, 2026-08-26).
--
-- 1. core_entities.knowledge_cuisines: the dish-knowledge pass's cuisine
--    facet — canonical facet='cuisine' place_attribute ids the dish NAME
--    itself entails ("birria" -> mexican). Versioned by the existing
--    knowledge_prompt_version ledger stamp.
-- 2. core_restaurant_items.cuisine_projection_version: the grain-bridge
--    stamp — which dish-knowledge rule version this connection's
--    food_attributes last absorbed. NULL = never projected; the reconciler
--    re-projects rows whose stamp differs from the food entity's
--    knowledge_prompt_version.
--
-- Both are plain ADD COLUMN with a non-volatile default / NULL — no table
-- rewrite (AUTHORING.md §1, measured 2026-08-09), no parallel-worker guard
-- needed.

ALTER TABLE "core_entities"
  ADD COLUMN "knowledge_cuisines" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

ALTER TABLE "core_restaurant_items"
  ADD COLUMN "cuisine_projection_version" INTEGER;
