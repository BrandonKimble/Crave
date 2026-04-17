ALTER TABLE "markets" RENAME TO "core_markets";
ALTER TABLE "census_cbsa_boundaries" RENAME TO "geo_census_cbsa_boundaries";
ALTER TABLE "census_place_boundaries" RENAME TO "geo_census_place_boundaries";
ALTER TABLE "on_demand_request_users" RENAME TO "collection_on_demand_request_users";
ALTER TABLE "keyword_attempt_history" RENAME TO "collection_keyword_attempt_history";
ALTER TABLE "reserved_usernames" RENAME TO "user_reserved_usernames";

ALTER INDEX "markets_pkey" RENAME TO "core_markets_pkey";
ALTER INDEX "markets_market_key_key" RENAME TO "core_markets_market_key_key";
ALTER INDEX "idx_markets_type" RENAME TO "idx_core_markets_type";
ALTER INDEX "idx_markets_source_community" RENAME TO "idx_core_markets_source_community";
ALTER INDEX "idx_markets_collectable" RENAME TO "idx_core_markets_collectable";
ALTER INDEX "idx_markets_scheduler_enabled" RENAME TO "idx_core_markets_scheduler_enabled";
ALTER INDEX "idx_markets_cbsa_code" RENAME TO "idx_core_markets_cbsa_code";
ALTER INDEX "idx_markets_place_geoid" RENAME TO "idx_core_markets_place_geoid";
ALTER INDEX "idx_markets_is_active" RENAME TO "idx_core_markets_is_active";
ALTER INDEX "idx_markets_center" RENAME TO "idx_core_markets_center";
ALTER INDEX "idx_markets_geometry" RENAME TO "idx_core_markets_geometry";

ALTER INDEX "census_cbsa_boundaries_pkey" RENAME TO "geo_census_cbsa_boundaries_pkey";
ALTER INDEX "idx_census_cbsa_type" RENAME TO "idx_geo_census_cbsa_type";
ALTER INDEX "idx_census_cbsa_center" RENAME TO "idx_geo_census_cbsa_center";
ALTER INDEX "idx_census_cbsa_geometry" RENAME TO "idx_geo_census_cbsa_geometry";

ALTER INDEX "census_place_boundaries_pkey" RENAME TO "geo_census_place_boundaries_pkey";
ALTER INDEX "idx_census_places_state_code" RENAME TO "idx_geo_census_places_state_code";
ALTER INDEX "idx_census_places_center" RENAME TO "idx_geo_census_places_center";
ALTER INDEX "idx_census_places_geometry" RENAME TO "idx_geo_census_places_geometry";

ALTER INDEX "on_demand_request_users_pkey" RENAME TO "collection_on_demand_request_users_pkey";
ALTER INDEX "idx_on_demand_request_users_user_id" RENAME TO "idx_collection_on_demand_request_users_user_id";
ALTER INDEX "idx_on_demand_request_users_created_at" RENAME TO "idx_collection_on_demand_request_users_created_at";

ALTER INDEX "keyword_attempt_history_pkey" RENAME TO "collection_keyword_attempt_history_pkey";
ALTER INDEX "idx_keyword_attempt_history_collectable_market_key" RENAME TO "idx_collection_keyword_attempt_history_collectable_market_key";
ALTER INDEX "idx_keyword_attempt_history_cooldown_until" RENAME TO "idx_collection_keyword_attempt_history_cooldown_until";

ALTER INDEX "reserved_usernames_pkey" RENAME TO "user_reserved_usernames_pkey";

ALTER TABLE "core_markets"
  RENAME CONSTRAINT "markets_census_cbsa_code_fkey" TO "core_markets_census_cbsa_code_fkey";

ALTER TABLE "core_markets"
  RENAME CONSTRAINT "markets_census_place_geoid_fkey" TO "core_markets_census_place_geoid_fkey";

ALTER TABLE "collection_on_demand_request_users"
  RENAME CONSTRAINT "on_demand_request_users_request_id_fkey" TO "collection_on_demand_request_users_request_id_fkey";

ALTER TABLE "collection_on_demand_request_users"
  RENAME CONSTRAINT "on_demand_request_users_user_id_fkey" TO "collection_on_demand_request_users_user_id_fkey";
