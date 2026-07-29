-- P5b (one-ground charter): a poll act's WHERE is a PLACE, not a rectangle.
--
-- Until now polls.service.pollSignalGeo wrote the place's stored BOUNDING
-- RECTANGLE into the signal's geo columns. Measured on prod over all 22,778
-- places with a ground: ST_Covers(ground, own_bbox) is FALSE for 22,774
-- (99.98%) — a polygon never covers its own bounding box — so the attribution
-- law's "containing" arm never fired for the poll's own place, and the
-- "tiling" arm carried it instead and OVER-FIRED: every place whose ground
-- fits inside that rectangle collected the act. Austin bled into 31 other
-- places, Denver and Portland into 9 each.
--
-- The other signal kinds are HONEST and untouched: a viewport genuinely IS a
-- rectangle (charter "what survives as a rectangle", item 1) and entity_view
-- is genuinely a point. This column is the anchor for the kinds whose WHERE
-- is a place, and it is NULL for the rest.
ALTER TABLE signals ADD COLUMN place_id uuid;

-- The attribution join reads place-anchored signals by their anchor.
CREATE INDEX idx_signals_place_id ON signals (place_id) WHERE place_id IS NOT NULL;
