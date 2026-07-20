-- §1 identity-law COUNTY-AXIS amendment (master plan §18 item 8, ratified
-- 2026-07-19): the tuple (country, subdivision, level, name) collides
-- genuinely distinct same-name municipalities inside one state (17 gazetteer
-- groups, e.g. the two TX "Lakeside"s 4.7° apart). The discriminator is the
-- COUNTY AXIS: an optional county-NAME column (no stable cross-provider
-- county code exists — TomTom countrySecondarySubdivision and the Census
-- county gazetteer both speak names), fed organically by the provider chain
-- and seed-side via the Census place→county relationship join.
ALTER TABLE places ADD COLUMN county VARCHAR(128);

-- Rebuild the identity index with the county axis. lower(county) mirrors the
-- lower(name) law (§1: case is display, not identity). NULLS NOT DISTINCT is
-- retained: at most ONE county-unknown row per (country, subdivision, level,
-- name). A county-carrying row and a county-unknown row MAY coexist under
-- this index — the merge law (PlacesCatalogService.resolveIdentity) decides
-- whether an observation gap-fills the NULL row (same real place, county
-- newly learned) or mints a genuinely distinct sibling; the index only
-- guarantees no EXACT-tuple twins.
DROP INDEX IF EXISTS "uq_places_identity";
CREATE UNIQUE INDEX "uq_places_identity" ON "places"("country_code", "subdivision_code", lower(county), "provider_level_code", lower("name")) NULLS NOT DISTINCT;
