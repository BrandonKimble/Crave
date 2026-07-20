-- §22 item 7: COLLECTOR AT PRIORS — source-centric collection model (§9-§12).
-- Collection work keys off SOURCES; engines are operator-attached member-place
-- sets (territory = derived union, never stored); cadence + lane state live on
-- per-(source, lane) rows; the market-keyed planner table dies.

-- ---------------------------------------------------------------------------
-- §5 engines
-- ---------------------------------------------------------------------------
CREATE TABLE engines (
  engine_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             varchar(255) NOT NULL UNIQUE,
  member_place_ids uuid[] NOT NULL DEFAULT '{}',
  created_at       timestamp NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- §10 per-(source, lane) cadence + state + output-derived heartbeat
-- ---------------------------------------------------------------------------
CREATE TABLE source_collection_lanes (
  source_id               uuid NOT NULL REFERENCES sources(source_id),
  lane                    varchar(32) NOT NULL,
  enabled                 boolean NOT NULL DEFAULT true,
  cadence_days            float8 NOT NULL,
  lateness_tolerance_days float8 NOT NULL,
  due_at                  timestamp NOT NULL DEFAULT now(),
  last_ran_at             timestamp,
  state                   jsonb,
  last_output_docs        integer,
  output_docs_baseline    float8,
  created_at              timestamp NOT NULL DEFAULT now(),
  updated_at              timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, lane)
);
CREATE INDEX idx_source_collection_lanes_due
  ON source_collection_lanes (enabled, due_at);

-- ---------------------------------------------------------------------------
-- §12.6 singleton rescorer state (dirty flag + debounce watermark)
-- ---------------------------------------------------------------------------
CREATE TABLE rescore_state (
  id              integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dirty           boolean NOT NULL DEFAULT false,
  dirty_since     timestamp(3),
  last_rescore_at timestamp(3)
);
INSERT INTO rescore_state (id, dirty) VALUES (1, false);

-- ---------------------------------------------------------------------------
-- §11 attempt-ledger re-key seam: (engine, term) is the schedulable unit.
-- Legacy market_key PK column survives until Phase C.
-- ---------------------------------------------------------------------------
ALTER TABLE collection_keyword_attempt_history ADD COLUMN engine_id uuid;
CREATE INDEX idx_collection_keyword_attempt_history_engine_term
  ON collection_keyword_attempt_history (engine_id, normalized_term);

-- ---------------------------------------------------------------------------
-- Backfill: map the existing reddit communities onto engines + sources.
-- Engine name = the legacy market_key (stable natural key through Phase B/C;
-- the ask-event unmet lane still reads collectable_market_key by this name).
-- Members = the municipality place matched from the community's location_name.
-- ---------------------------------------------------------------------------
INSERT INTO engines (name, member_place_ids)
SELECT cc.market_key, ARRAY[p.place_id]
FROM collection_communities cc
JOIN places p
  ON lower(p.name) = lower(trim(split_part(cc.location_name, ',', 1)))
 AND p.subdivision_code = upper(trim(split_part(cc.location_name, ',', 2)))
 AND p.provider_level_code = 'Municipality'
WHERE cc.is_active AND cc.market_key IS NOT NULL
ON CONFLICT (name) DO NOTHING;

INSERT INTO sources (platform, handle, anchor_place_id, engine_id)
SELECT 'reddit', cc.community_name::text, e.member_place_ids[1], e.engine_id
FROM collection_communities cc
JOIN engines e ON e.name = cc.market_key
WHERE cc.is_active
ON CONFLICT (platform, handle) DO NOTHING;

-- Lanes seeded from the dying planner rows. Tolerance: chronological declares
-- ≈ its cadence (§14.3); keyword tolerance = its cadence ("a keyword sweep a
-- week late is fine" — K1, OWNER-RATIFY). Chronological cursor state moves
-- from collection_communities.last_processed onto the lane row (§10: lane
-- state lives on the lane row).
INSERT INTO source_collection_lanes
  (source_id, lane, enabled, cadence_days, lateness_tolerance_days,
   due_at, last_ran_at, state)
SELECT
  s.source_id,
  cs.work_kind::text,
  cs.enabled,
  cs.interval_days,
  cs.interval_days,
  cs.next_due_at,
  cs.last_ran_at,
  CASE
    WHEN cs.work_kind::text = 'chronological' THEN
      jsonb_strip_nulls(jsonb_build_object(
        'lastProcessedAt', to_char(cc.last_processed AT TIME ZONE 'UTC',
                                   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    ELSE COALESCE(cs.metadata, '{}'::jsonb)
  END
FROM collection_schedules cs
JOIN sources s
  ON s.platform = 'reddit' AND lower(s.handle) = lower(cs.community)
JOIN collection_communities cc
  ON lower(cc.community_name::text) = lower(cs.community)
WHERE cs.work_kind::text IN ('chronological', 'keyword')
ON CONFLICT (source_id, lane) DO NOTHING;

UPDATE collection_keyword_attempt_history h
SET engine_id = e.engine_id
FROM engines e
WHERE e.name = h.collectable_market_key;

-- ---------------------------------------------------------------------------
-- Kills (§21/§23): the market-keyed planner table + its work-kind enum die
-- (the hot-spike lane dies with them — §11: no hot-spike lane exists; the
-- SURGE family is an hourly aggregate reader, trigger-deferred per §22).
-- ---------------------------------------------------------------------------
DROP TABLE collection_schedules;
DROP TYPE "CollectionWorkKind";
