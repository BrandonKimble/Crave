-- Retired-entity state for data-quality reclasses (e.g. cuisine-hub foods).
-- Additive enum change; every read path already filters status='active'.
ALTER TYPE "entity_status" ADD VALUE IF NOT EXISTS 'archived';
