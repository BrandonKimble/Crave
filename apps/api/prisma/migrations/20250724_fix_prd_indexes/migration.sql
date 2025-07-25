-- Migration to fix PRD Section 4.1 index inconsistencies
-- This migration aligns database indexes with PRD specifications for optimal text search and performance

-- Enable required extensions for text search optimization
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Drop existing basic indexes that will be replaced with optimized versions
DROP INDEX IF EXISTS "idx_entities_name";
DROP INDEX IF EXISTS "idx_entities_aliases";
DROP INDEX IF EXISTS "idx_entities_address";
DROP INDEX IF EXISTS "idx_entities_restaurant_attributes";

-- Create PRD-compliant GIN indexes for fuzzy text search optimization
-- These enable fast fuzzy matching on entity names, aliases, and addresses

-- Entity name fuzzy search index (all entity types)
CREATE INDEX "idx_entities_name_gin" ON "entities" USING gin("name" gin_trgm_ops);

-- Entity aliases fuzzy search index (all entity types)
CREATE INDEX "idx_entities_aliases_gin" ON "entities" USING gin("aliases" gin_trgm_ops);

-- Restaurant address fuzzy search index (restaurant entities only)
CREATE INDEX "idx_entities_address_gin" ON "entities" USING gin("address" gin_trgm_ops) WHERE "type" = 'restaurant';

-- Restaurant attributes index with conditional WHERE clause (restaurant entities only)
CREATE INDEX "idx_entities_restaurant_attributes_gin" ON "entities" USING gin("restaurant_attributes") WHERE "type" = 'restaurant';

-- Note: Geospatial index optimization requires PostGIS extension
-- Current composite index on (longitude, latitude) is functional but not optimal per PRD
-- For full PRD compliance, consider migrating to PostGIS GIST index:
-- CREATE INDEX "idx_entities_location_gist" ON "entities" USING gist(point("longitude", "latitude")) WHERE "type" = 'restaurant';

-- Update migration metadata
COMMENT ON INDEX "idx_entities_name_gin" IS 'PRD Section 4.1.1 - Fuzzy text search on entity names using trigram matching';
COMMENT ON INDEX "idx_entities_aliases_gin" IS 'PRD Section 4.1.1 - Fuzzy text search on entity aliases using trigram matching';
COMMENT ON INDEX "idx_entities_address_gin" IS 'PRD Section 4.1.1 - Fuzzy text search on restaurant addresses with conditional filtering';
COMMENT ON INDEX "idx_entities_restaurant_attributes_gin" IS 'PRD Section 4.1.1 - Optimized restaurant attribute filtering with conditional WHERE clause';