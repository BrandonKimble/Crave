-- Rederivation F301: the Phase C purge dropped "SearchEventKind" etc. —
-- Prisma MODEL names that never existed as type names; IF EXISTS made
-- all three misses silent successes. The real snake_case types survived
-- on every database with zero column and zero code references (proven:
-- pg_attribute scan + repo grep + migrate diff). Forward drop; applied
-- history untouched.
DROP TYPE IF EXISTS "search_event_kind";
DROP TYPE IF EXISTS "demand_source_kind";
DROP TYPE IF EXISTS "demand_signal_kind";
