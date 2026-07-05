-- On-demand demand-identity fix: `reason` was part of the request's UNIQUE key,
-- so the SAME demand (term+type+market+entity-lane) arriving as 'unresolved' at
-- interpretation time AND 'low_result' at search time produced TWO rows with
-- independent cooldowns/queues. Reason becomes an attribute (last writer wins);
-- identity drops it. Ask events additionally gain search_request_id so one
-- search request never double-logs an ask from the two signal sites.

-- 1) Merge duplicate rows on the new identity (keep earliest created).
WITH ranked AS (
  SELECT request_id, term, entity_type, market_key, entity_identity_key,
         row_number() OVER (
           PARTITION BY term, entity_type, market_key, entity_identity_key
           ORDER BY created_at ASC, request_id ASC
         ) AS rn,
         first_value(request_id) OVER (
           PARTITION BY term, entity_type, market_key, entity_identity_key
           ORDER BY created_at ASC, request_id ASC
         ) AS keeper_id
  FROM collection_on_demand_requests
),
losers AS (SELECT request_id, keeper_id FROM ranked WHERE rn > 1)
-- repoint users (dedupe on conflict), repoint ask events, then delete losers
, moved_users AS (
  INSERT INTO collection_on_demand_request_users (request_id, user_id, first_seen_at, last_seen_at)
  SELECT l.keeper_id, u.user_id, u.first_seen_at, u.last_seen_at
  FROM collection_on_demand_request_users u
  JOIN losers l ON l.request_id = u.request_id
  ON CONFLICT (request_id, user_id) DO UPDATE
    SET last_seen_at = GREATEST(collection_on_demand_request_users.last_seen_at, EXCLUDED.last_seen_at),
        first_seen_at = LEAST(collection_on_demand_request_users.first_seen_at, EXCLUDED.first_seen_at)
  RETURNING 1
)
, moved_asks AS (
  UPDATE collection_on_demand_ask_events e
  SET request_id = l.keeper_id
  FROM losers l WHERE e.request_id = l.request_id
  RETURNING 1
)
DELETE FROM collection_on_demand_request_users u
USING losers l WHERE u.request_id = l.request_id;

WITH ranked AS (
  SELECT request_id,
         row_number() OVER (
           PARTITION BY term, entity_type, market_key, entity_identity_key
           ORDER BY created_at ASC, request_id ASC
         ) AS rn
  FROM collection_on_demand_requests
)
DELETE FROM collection_on_demand_requests r
USING ranked WHERE ranked.request_id = r.request_id AND ranked.rn > 1;

-- 2) Recompute distinct_user_count for survivors.
UPDATE collection_on_demand_requests r
SET distinct_user_count = COALESCE(u.cnt, 0)
FROM (SELECT request_id, count(DISTINCT user_id) AS cnt
      FROM collection_on_demand_request_users GROUP BY request_id) u
WHERE u.request_id = r.request_id;

-- 3) Swap the unique constraint.
DROP INDEX IF EXISTS "uq_on_demand_request_state_entity_lane";
ALTER TABLE collection_on_demand_requests
  DROP CONSTRAINT IF EXISTS "uq_on_demand_request_state_entity_lane";
CREATE UNIQUE INDEX "uq_on_demand_request_identity"
  ON collection_on_demand_requests (term, entity_type, market_key, entity_identity_key);

-- 4) Ask-event request-scoped dedup support.
ALTER TABLE collection_on_demand_ask_events
  ADD COLUMN IF NOT EXISTS search_request_id UUID;
CREATE INDEX IF NOT EXISTS idx_on_demand_ask_events_search_request
  ON collection_on_demand_ask_events (search_request_id)
  WHERE search_request_id IS NOT NULL;
