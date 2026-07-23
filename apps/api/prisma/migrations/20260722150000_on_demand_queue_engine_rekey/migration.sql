-- Engine-coverage re-key (leg 2 flagged migration): the on-demand queue's
-- market_key column becomes engine_id (RENAME preserves indexes/constraints).
ALTER TABLE collection_on_demand_requests RENAME COLUMN market_key TO engine_id;
