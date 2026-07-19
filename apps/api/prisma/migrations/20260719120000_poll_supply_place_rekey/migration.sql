-- §22 item 4: poll SUPPLY cut (plans/geo-demand-foundation-rebuild.md §4/§5).
-- Polls re-key to the place catalog; §5 sources table (poll_surface rooms);
-- supply-controller state; weekly-ritual idempotency ledger.

-- Structural bootstrap poll type (§4: "Best restaurants in {place}").
ALTER TYPE poll_topic_type ADD VALUE IF NOT EXISTS 'best_restaurants';

-- Polls + topics attach to placeId (catalog). Old rows keep marketKey.
ALTER TABLE polls ADD COLUMN IF NOT EXISTS place_id uuid;
ALTER TABLE poll_topics ADD COLUMN IF NOT EXISTS place_id uuid;
CREATE INDEX IF NOT EXISTS idx_polls_place_id ON polls (place_id);
CREATE INDEX IF NOT EXISTS idx_poll_topics_place_id ON poll_topics (place_id);

-- §5 sources: { sourceId, platform, handle, anchorPlaceId, engineId?, createdAt }.
-- poll_surface rows carry NO engineId (reddit-class only).
CREATE TABLE IF NOT EXISTS sources (
    source_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform        varchar(32) NOT NULL,
    handle          varchar(255) NOT NULL,
    anchor_place_id uuid,
    engine_id       uuid,
    created_at      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS sources_platform_handle_key
    ON sources (platform, handle);
CREATE INDEX IF NOT EXISTS idx_sources_anchor_place ON sources (anchor_place_id);

-- §4 supply-controller state per place (frontier + phase + credit warrant).
CREATE TABLE IF NOT EXISTS poll_place_supply (
    place_id          uuid PRIMARY KEY,
    frontier          integer NOT NULL,
    phase             varchar(16) NOT NULL,
    credit            decimal(18, 6) NOT NULL DEFAULT 0,
    credit_updated_at timestamp(3),
    created_at        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- §4 weekly ritual ledger; UNIQUE (place_id, week_of) = the idempotency key.
CREATE TABLE IF NOT EXISTS poll_weekly_ticks (
    tick_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id        uuid NOT NULL,
    week_of         varchar(10) NOT NULL,
    published_count integer NOT NULL,
    factors         jsonb,
    published_at    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS poll_weekly_ticks_place_week_key
    ON poll_weekly_ticks (place_id, week_of);
