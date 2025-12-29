-- Enable extensions needed for autocomplete matching
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch";

-- Speed up name/prefix matching for autocomplete
CREATE INDEX IF NOT EXISTS "idx_core_entities_name_lower_trgm"
  ON "core_entities" USING gin (lower("name") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_core_entities_name_lower_prefix"
  ON "core_entities" (lower("name") text_pattern_ops);

-- Speed up query suggestion prefix scans
CREATE INDEX IF NOT EXISTS "idx_search_log_query_text_lower_prefix"
  ON "user_search_logs" (lower("query_text") text_pattern_ops)
  WHERE "source" = 'search' AND "query_text" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_search_log_query_text_lower_trgm"
  ON "user_search_logs" USING gin (lower("query_text") gin_trgm_ops)
  WHERE "source" = 'search' AND "query_text" IS NOT NULL;
