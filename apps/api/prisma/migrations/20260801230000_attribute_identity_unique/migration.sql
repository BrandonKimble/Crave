-- CLASS ④ closing move: the DB backstop for entity identity, scoped to
-- what can be enforced TODAY without lying:
--   - ATTRIBUTES get a generated stripped-key column + partial UNIQUE
--     (their vocabulary is now duplicate-free; a twin becomes impossible,
--     not just unlikely).
--   - FOODS stay lock+probe+nightly-sweep protected (their identity key
--     needs the TS lemma fold — no SQL expression can compute it).
--   - RESTAURANTS are deliberately EXCLUDED: legitimate chain branches
--     share a stripped name (Blaze Pizza x2); a unique index would forbid
--     them. Blocked on the P2.2 chain/branch model.
ALTER TABLE core_entities
  ADD COLUMN IF NOT EXISTS identity_key TEXT
  GENERATED ALWAYS AS (
    btrim(regexp_replace(regexp_replace(lower(name), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g'))
  ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attribute_identity_key
  ON core_entities (type, identity_key)
  WHERE status <> 'archived'
    AND type IN ('food_attribute', 'restaurant_attribute');

-- non-unique support index for the stripped-name probes (they were seq
-- scans inside the entity-creation transaction)
CREATE INDEX IF NOT EXISTS idx_entities_type_identity_key
  ON core_entities (type, identity_key);
