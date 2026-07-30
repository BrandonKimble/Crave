-- Dietary hardness (search rebuild phase 1, slice 2; spec §1.3).
-- Hardness is a FACT about the vocabulary, never guessed per query: a small
-- curated set of LIFESTYLE attribute entities is flagged 'dietary', and the
-- relaxation ladder may never drop a flagged id. Allergen toggles were
-- REJECTED by owner ruling (the claim data cannot keep that promise), so
-- the set is lifestyle-only and closed; everything unflagged stays soft.
ALTER TABLE core_entities
  ADD COLUMN IF NOT EXISTS constraint_class VARCHAR(16);

UPDATE core_entities
SET constraint_class = 'dietary'
WHERE status = 'active'
  AND type IN ('food_attribute', 'restaurant_attribute')
  AND lower(name) IN ('vegan', 'vegetarian', 'gluten free', 'halal', 'kosher');
