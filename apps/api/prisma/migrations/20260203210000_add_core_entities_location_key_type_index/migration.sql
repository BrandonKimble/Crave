-- Speed up coverageKey-scoped restaurant lookups.
-- Used by shortcut map coverage endpoints.

CREATE INDEX IF NOT EXISTS "idx_core_entities_location_key_type"
  ON "core_entities" ("location_key", "type");

