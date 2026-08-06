-- NINE INDEXES THAT INDEX NOTHING A UNIQUE INDEX DOES NOT ALREADY INDEX.
--
-- Each DROP below was verified against pg_indexes: same table, same method,
-- same column list (or same expression) as a UNIQUE index that survives. A
-- UNIQUE btree serves every lookup a plain btree on the identical columns
-- serves, so this is subsumption, not a judgment call about traffic — no
-- idx_scan statistics were consulted and none are needed.
--
-- The write tax is the point. core_entities carries 34 indexes totalling
-- ~83 MB against a ~12 MB table; every insert maintains all of them.
--
-- HOW THE TRGM PAIR HAPPENED, since it is the instructive one: the table was
-- once named `entities` and 20251116090000_autocomplete_trgm built
-- idx_entities_name_lower_trgm on it. The rename to core_entities carried the
-- index across under its old name, so 20251226090000_autocomplete_perf_indexes
-- saw no index matching the new naming convention and built a second one with
-- byte-identical indexdef. The survivor is the correctly-named one.
--
-- NOT dropped, deliberately: idx_entities_type. It is a leftmost prefix of
-- idx_entities_type_status rather than a duplicate of it, and a narrower index
-- is genuinely cheaper to scan for type-only predicates. Subsumption by prefix
-- is a judgment call about real traffic; subsumption by identity is not.

DROP INDEX IF EXISTS idx_entities_name_lower_trgm;
DROP INDEX IF EXISTS idx_entities_primary_location;
DROP INDEX IF EXISTS idx_restaurant_locations_google_place_id;
DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_users_username;
DROP INDEX IF EXISTS idx_users_auth_provider_user_id;
DROP INDEX IF EXISTS idx_users_revenuecat_app_user_id;
DROP INDEX IF EXISTS idx_subscriptions_provider_external_id;
DROP INDEX IF EXISTS collection_communities_community_name_idx;
