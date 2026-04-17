-- Add a fast, index-backed entity text search document for core_entities.
-- This supports word-oriented lookup (FTS), complementing the existing trigram indexes.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Deterministic text document used for search indexing.
CREATE OR REPLACE FUNCTION crave_entity_search_tsv(name text, aliases text[])
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_tsvector(
    'simple',
    concat_ws(
      ' ',
      lower(coalesce($1, '')),
      lower(coalesce(array_to_string($2, ' '), ''))
    )
  );
$$;

CREATE INDEX IF NOT EXISTS "idx_core_entities_entity_search_tsv_gin"
  ON "core_entities"
  USING gin (crave_entity_search_tsv("name"::text, "aliases"));
