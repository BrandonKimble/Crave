-- THE FINAL DISSOLUTION (one-ground charter, 2026-07-30): identity is the
-- vendor's own key — (geometry id, entityType). The vendor legitimately
-- stamps ONE geometry id on two rungs for a coincident boundary and tells
-- them apart by entityType; our simple-unique id could not represent that,
-- which forced the id-strip hack that kept the name-identity machinery
-- alive. All 22,769 current ids are globally unique, so the composite holds
-- trivially at migration time.
DROP INDEX IF EXISTS "places_provider_place_id_key";
CREATE UNIQUE INDEX "places_provider_place_id_level_key"
  ON places (provider_place_id, provider_level_code);
