-- The entity_satisfies FK index, relocated from 20260805130000 (index_every_
-- foreign_key). That migration carried a timestamp EARLIER than the migration
-- creating entity_satisfies (20260805200000), so a fresh-chain apply (CI's
-- test database; any future environment built from scratch) failed with
-- "relation does not exist" — while staging/local applied it fine because
-- their table predated the file. Ordering is now correct by construction.
-- IF NOT EXISTS because staging and local already carry the index from the
-- original placement.
CREATE INDEX IF NOT EXISTS "idx_entity_satisfies_to_entity_id" ON "entity_satisfies" ("to_entity_id");
