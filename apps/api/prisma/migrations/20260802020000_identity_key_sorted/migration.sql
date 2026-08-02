-- FINAL-FINAL RED TEAM high-2: the food identity lock keys on the
-- PER-TOKEN LEMMA fold, sorted — but every probe that must catch what the
-- lock serializes (creation order-probe, dedupe order lane) sorted raw
-- crave_fold tokens, so plural×word-order twins ("dumpling soup"/"soup
-- dumplings", 7 live pairs) minted through four divergent predicates.
-- The lemma fold is TS-only (no SQL can mirror it), so the key is a plain
-- APP-WRITTEN column: entityIdentityKey(name, type), written at create
-- and refreshed by the nightly dedupe. NULL = not yet backfilled; every
-- reader treats NULL as no-match.
ALTER TABLE core_entities ADD COLUMN IF NOT EXISTS identity_key_sorted TEXT;
CREATE INDEX IF NOT EXISTS idx_entities_type_identity_key_sorted
  ON core_entities (type, identity_key_sorted);
