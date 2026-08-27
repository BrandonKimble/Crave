-- Redteam L3 F8 (2026-08-26): idx_entities_restaurant_attributes was recreated
-- as a plain BTREE on a uuid[] in 20251221010607_reconcile_followup. BTREE on
-- an array serves no `@>`/`&&` membership query — every attribute-membership
-- read rides the partial GIN `idx_entities_restaurant_attributes_validation`
-- (USING gin (restaurant_attributes) WHERE type = 'place'). The BTREE is pure
-- write cost; drop it. (Light DDL — no table rewrite, no parallel-worker guard
-- needed per AUTHORING.md §1.)
DROP INDEX IF EXISTS "idx_entities_restaurant_attributes";
