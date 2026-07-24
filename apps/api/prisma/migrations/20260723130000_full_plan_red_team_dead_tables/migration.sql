-- Full-plan red team 2026-07-23: pre-ledger write-only event tables die
-- (the signals ledger fully superseded them; zero readers verified), and
-- the volume-tracking sampling columns die (zero writers since the v2
-- collector; the loss-horizon floor measures rates from source documents).
DROP TABLE IF EXISTS user_favorite_events;
DROP TABLE IF EXISTS user_events;
DROP TYPE IF EXISTS favorite_event_kind;
ALTER TABLE collection_communities DROP COLUMN IF EXISTS avg_posts_per_day;
ALTER TABLE collection_communities DROP COLUMN IF EXISTS last_calculated;
ALTER TABLE collection_communities DROP COLUMN IF EXISTS safe_interval_days;
