-- P2.2 locations-follow-testimony: cooldown ledger for demand-driven
-- metro branch expansion. One row per (restaurant, community source
-- handle) records the last metro-biased Places probe, so a brand with
-- genuinely no local store is re-checked at most once per cooldown.
CREATE TABLE IF NOT EXISTS metro_location_probes (
  restaurant_id UUID NOT NULL REFERENCES core_entities(entity_id) ON DELETE CASCADE,
  community_handle TEXT NOT NULL,
  probed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, community_handle)
);
