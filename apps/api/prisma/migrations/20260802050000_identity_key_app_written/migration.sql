-- IDEAL-SHAPE PASS (2026-08-02): identity_key becomes APP-WRITTEN.
-- The GENERATED column required a byte-identical SQL mirror of the TS
-- fold — and Unicode character classes are PLATFORM-DEPENDENT in
-- Postgres ([:alnum:] folds Devanagari differently on glibc PG17 than
-- mac PG18; measured on prod vs the mirror). One implementation
-- (canonicalFold in entity-identity.ts) now writes both identity_key
-- and identity_key_sorted; the DB stores and uniquely indexes. Backfill
-- runs post-deploy (scripts/backfill-identity-keys.ts); NULLs never
-- violate the partial unique, and the nightly heal keeps keys current.
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;
ALTER TABLE core_entities DROP COLUMN IF EXISTS identity_key;
ALTER TABLE core_entities ADD COLUMN identity_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_attribute_identity_key
  ON core_entities (type, identity_key)
  WHERE status <> 'archived'
    AND type IN ('food_attribute', 'restaurant_attribute')
    AND identity_key <> '';
CREATE INDEX IF NOT EXISTS idx_entities_type_identity_key
  ON core_entities (type, identity_key);
DROP FUNCTION IF EXISTS crave_fold(text);
