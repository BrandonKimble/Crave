-- Phase C purge (geo-demand rebuild §15/§21): drop everything the signals
-- substrate superseded. Readers were cut in §22 item 6 (aggregate+readers);
-- writers die in the same deploy as this migration.
--
--  * search_events / search_event_entities  -> signals kind='search' (+meta)
--  * user_search_demand_daily (old rollup)  -> signal_demand_daily
--  * user_restaurant_views / user_food_views / user_entity_view_events
--                                           -> signals kind='entity_view'
--  * collection_on_demand_ask_events        -> signals kind='on_demand_ask'
--  * core_public_entity_scores.scoring_market_key -> provenance_source_id
--    (score v4 cut; the column was already NULL on every re-scored row)

DROP TABLE IF EXISTS search_event_entities;
DROP TABLE IF EXISTS search_events;
DROP TABLE IF EXISTS user_search_demand_daily;
DROP TABLE IF EXISTS user_restaurant_views;
DROP TABLE IF EXISTS user_food_views;
DROP TABLE IF EXISTS user_entity_view_events;
DROP TABLE IF EXISTS collection_on_demand_ask_events;

DROP TYPE IF EXISTS "SearchEventKind";
DROP TYPE IF EXISTS "DemandSourceKind";
DROP TYPE IF EXISTS "DemandSignalKind";

-- Index idx_public_entity_scores_market_subject_display drops with the column.
ALTER TABLE core_public_entity_scores DROP COLUMN IF EXISTS scoring_market_key;
