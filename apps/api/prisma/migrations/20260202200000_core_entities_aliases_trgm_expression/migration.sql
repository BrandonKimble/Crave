-- Make alias substring matching indexable for text search / expansion.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Postgres requires index expressions to be immutable; wrap the expression in
-- an IMMUTABLE function so the planner can use it in GIN trigram indexes.
CREATE OR REPLACE FUNCTION crave_aliases_haystack_lower(aliases text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(array_to_string($1, ' '));
$$;

CREATE INDEX IF NOT EXISTS "idx_core_entities_aliases_haystack_lower_trgm"
  ON "core_entities"
  USING gin (crave_aliases_haystack_lower("aliases") gin_trgm_ops);
