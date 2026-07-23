-- Markets extermination leg 4: physical drop of the dead market schema
-- (geo-demand rebuild §2.5/§2.6; legs 1-3 removed every reader/writer).

-- Dead market_key columns (zero readers/writers since leg 3)
ALTER TABLE polls DROP COLUMN IF EXISTS market_key;
ALTER TABLE poll_topics DROP COLUMN IF EXISTS market_key;
ALTER TABLE collection_communities DROP COLUMN IF EXISTS market_key;
ALTER TABLE demand_scoring_runs DROP COLUMN IF EXISTS market_key;
ALTER TABLE demand_scoring_candidates DROP COLUMN IF EXISTS market_key;
-- DB-only debugging VIEW (absent from schema.prisma and all code) whose
-- definition joins core_entity_market_presence: dead, drop with the table.
DROP VIEW IF EXISTS connection_entity_names;

-- collectable_market_key now carries the ENGINE natural name: rename honestly
ALTER TABLE demand_scoring_runs RENAME COLUMN collectable_market_key TO engine_name;
ALTER TABLE demand_scoring_candidates RENAME COLUMN collectable_market_key TO engine_name;
ALTER TABLE collection_keyword_attempt_history RENAME COLUMN collectable_market_key TO engine_name;
ALTER INDEX IF EXISTS idx_demand_scoring_runs_collectable_consumer RENAME TO idx_demand_scoring_runs_engine_consumer;
ALTER INDEX IF EXISTS idx_collection_keyword_attempt_history_collectable_market_key RENAME TO idx_collection_keyword_attempt_history_engine_name;

-- Dead market tables (drop core_markets before geo_boundary_features: FK)
DROP TABLE IF EXISTS core_entity_market_presence;
DROP TABLE IF EXISTS market_bootstrap_events;
DROP TABLE IF EXISTS core_markets;
DROP TABLE IF EXISTS geo_boundary_features;

-- Dead enum
DROP TYPE IF EXISTS market_type;
