-- Clean cutover from provider-shaped regional markets to app-owned regions.
-- The final runtime schema has no Census/CBSA tables, columns, market types, or
-- source-boundary references. Historical regional geometry may survive on
-- existing core_markets rows, but it is no longer treated as provider identity.

CREATE TEMP TABLE regional_market_key_map AS
WITH regional_source AS (
  SELECT
    market_key AS old_key,
    lower(country_code) AS country_slug,
    COALESCE(
      NULLIF(lower(state_code), ''),
      NULLIF(
        trim(both '-' from lower(regexp_replace(regexp_replace(market_name, '^.*, *', ''), '[^A-Za-z0-9]+', '-', 'g'))),
        ''
      ),
      'unknown'
    ) AS admin1_slug,
    trim(both '-' from lower(regexp_replace(COALESCE(NULLIF(market_short_name, ''), market_name), '[^A-Za-z0-9]+', '-', 'g'))) AS market_slug
  FROM core_markets
  WHERE market_type::text IN ('cbsa_metro', 'cbsa_micro')
     OR market_key LIKE 'us-cbsa-%'
),
regional AS (
  SELECT
    old_key,
    CASE
      WHEN old_key = 'us-cbsa-12420' THEN 'region-us-tx-austin'
      WHEN old_key = 'us-cbsa-35620' THEN 'region-us-ny-new-york'
      ELSE regexp_replace(
        'region-' || country_slug || '-' || admin1_slug || '-' || market_slug,
        '-+', '-', 'g'
      )
    END AS new_key
  FROM regional_source
)
SELECT old_key, new_key
FROM regional;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM regional_market_key_map
    GROUP BY new_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'regional market key collision during provider-neutral cutover';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM regional_market_key_map map
    JOIN core_markets market
      ON market.market_key = map.new_key
     AND market.market_key <> map.old_key
  ) THEN
    RAISE EXCEPTION 'regional market key already exists during provider-neutral cutover';
  END IF;
END $$;

UPDATE core_entity_market_presence target
SET market_key = map.new_key
FROM regional_market_key_map map
WHERE target.market_key = map.old_key;

UPDATE core_display_rank_scores target
SET market_key = map.new_key
FROM regional_market_key_map map
WHERE target.market_key = map.old_key;

UPDATE poll_topics target
SET market_key = map.new_key
FROM regional_market_key_map map
WHERE target.market_key = map.old_key;

UPDATE polls target
SET market_key = map.new_key
FROM regional_market_key_map map
WHERE target.market_key = map.old_key;

UPDATE user_search_logs target
SET market_key = map.new_key
FROM regional_market_key_map map
WHERE target.market_key = map.old_key;

UPDATE user_search_logs target
SET collectable_market_key = map.new_key
FROM regional_market_key_map map
WHERE target.collectable_market_key = map.old_key;

UPDATE user_search_demand_daily target
SET market_key = map.new_key
FROM regional_market_key_map map
WHERE target.market_key = map.old_key;

UPDATE user_search_demand_daily target
SET collectable_market_key = map.new_key
FROM regional_market_key_map map
WHERE target.collectable_market_key = map.old_key;

UPDATE demand_scoring_runs target
SET market_key = map.new_key
FROM regional_market_key_map map
WHERE target.market_key = map.old_key;

UPDATE demand_scoring_runs target
SET collectable_market_key = map.new_key
FROM regional_market_key_map map
WHERE target.collectable_market_key = map.old_key;

UPDATE demand_scoring_candidates target
SET market_key = map.new_key
FROM regional_market_key_map map
WHERE target.market_key = map.old_key;

UPDATE demand_scoring_candidates target
SET collectable_market_key = map.new_key
FROM regional_market_key_map map
WHERE target.collectable_market_key = map.old_key;

UPDATE collection_communities target
SET market_key = map.new_key
FROM regional_market_key_map map
WHERE target.market_key = map.old_key;

UPDATE market_bootstrap_events target
SET market_key = map.new_key
FROM regional_market_key_map map
WHERE target.market_key = map.old_key;

UPDATE collection_on_demand_requests target
SET market_key = map.new_key
FROM regional_market_key_map map
WHERE target.market_key = map.old_key;

UPDATE collection_on_demand_ask_events target
SET market_key = map.new_key
FROM regional_market_key_map map
WHERE target.market_key = map.old_key;

UPDATE collection_on_demand_ask_events target
SET collectable_market_key = map.new_key
FROM regional_market_key_map map
WHERE target.collectable_market_key = map.old_key;

UPDATE collection_keyword_attempt_history target
SET collectable_market_key = map.new_key
FROM regional_market_key_map map
WHERE target.collectable_market_key = map.old_key;

UPDATE core_markets market
SET
  market_key = map.new_key,
  source_boundary_provider = NULL,
  source_boundary_id = NULL,
  source_boundary_type = NULL,
  metadata = COALESCE(market.metadata, '{}'::jsonb) ||
    jsonb_build_object(
      'previousMarketKey',
      map.old_key,
      'boundaryKind',
      'app_region'
    )
FROM regional_market_key_map map
WHERE market.market_key = map.old_key;

ALTER TABLE core_markets
  DROP CONSTRAINT IF EXISTS core_markets_active_locality_source_boundary_check;

ALTER TABLE core_markets
  DROP CONSTRAINT IF EXISTS core_markets_census_cbsa_code_fkey;

DROP INDEX IF EXISTS idx_core_markets_cbsa_code;

ALTER TABLE core_markets
  DROP COLUMN IF EXISTS census_cbsa_code;

DELETE FROM geo_boundary_features
WHERE lower(source_provider) = 'census';

ALTER TYPE market_type RENAME TO market_type_old;

CREATE TYPE market_type AS ENUM ('regional', 'locality', 'manual');

ALTER TABLE core_markets
  ALTER COLUMN market_type TYPE market_type
  USING (
    CASE
      WHEN market_type::text IN ('cbsa_metro', 'cbsa_micro') THEN 'regional'
      WHEN market_type::text = 'local_fallback' THEN 'locality'
      ELSE market_type::text
    END
  )::market_type;

DROP TYPE market_type_old;

ALTER TABLE core_markets
  ADD CONSTRAINT core_markets_active_locality_source_boundary_check
  CHECK (
    market_type <> 'locality'::market_type
    OR is_active = false
    OR (
      source_boundary_provider = 'tomtom'
      AND source_boundary_id IS NOT NULL
      AND source_boundary_type = 'Municipality'
    )
  );

DROP TABLE IF EXISTS geo_census_cbsa_boundaries;
DROP TYPE IF EXISTS census_cbsa_type;

DROP TABLE regional_market_key_map;
