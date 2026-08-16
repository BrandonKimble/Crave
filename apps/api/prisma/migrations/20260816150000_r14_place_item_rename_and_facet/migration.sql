-- R14 taxonomy rename (owner-ruled): entity types restaurant->place,
-- food->item, restaurant_attribute->place_attribute,
-- food_attribute->item_attribute (ingredient unchanged), plus the carry-list
-- facet persistence for ALL place-attribute rows.
--
-- @map-VS-PHYSICAL DECISION (stated per the campaign brief):
--   * ENUM VALUES rename PHYSICALLY (ALTER TYPE ... RENAME VALUE — in-place,
--     catalog-only, safe). The enum values are DATA that surface verbatim as
--     TS string literals, API payloads, and raw-SQL comparisons; a
--     Prisma-@map on enum values would leave 'restaurant' in every raw SQL
--     WHERE while TS says 'place' — permanent value skew. Renaming them
--     physically keeps DB value == code literal == wire value.
--   * COLUMN AND TABLE physical names STAY; the rename happens at the
--     Prisma layer (field/model names with @map/@@map). Measured raw-SQL
--     density: 208 files use $queryRaw/$executeRaw/Prisma.sql; the
--     denormalized names alone (restaurant_attributes, food_attributes,
--     restaurant_metadata, food_id/restaurant_id) appear ~1,700 times across
--     ~100 files, plus index/constraint names, wipe-city-derived.sql, and
--     every operator psql habit. A physical column rename buys nothing the
--     @map cannot (code reads placeAttributes either way) and costs that
--     entire surface plus its verification. So: values rename, identifiers
--     stay mapped. Applied consistently — no column/table is renamed here.
--
-- FACET BACKFILL (carry-list #1, lens-B B3): facet ∈
-- {venue_kind, cuisine, amenity} persisted for ALL place_attribute rows.
-- Lists generated from the one authority,
-- src/modules/restaurant-enrichment/google-place-type-attributes.ts:
--   cuisine    = values of GOOGLE_PLACE_CUISINE_TYPE_MAP
--   venue_kind = values of GOOGLE_PLACE_NON_CUISINE_TYPE_MAP minus the
--                amenity carve-out {delivery, takeout, serves vegetarian
--                food} — service/diet properties of a venue, not what the
--                venue IS
--   amenity    = every remaining place_attribute (the LLM-coined property
--                vocabulary: ambiance/amenity/service/setting per the
--                attribute-placement contract)
-- The ~59 already-stamped cuisine rows keep their stamp (facet IS NULL
-- narrowing). facet is orthogonal to constraint_class ('vegan' stays
-- dietary-constrained even though Google classifies vegan_restaurant as a
-- venue kind).

SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

ALTER TYPE entity_type RENAME VALUE 'restaurant' TO 'place';
ALTER TYPE entity_type RENAME VALUE 'food' TO 'item';
ALTER TYPE entity_type RENAME VALUE 'food_attribute' TO 'item_attribute';
ALTER TYPE entity_type RENAME VALUE 'restaurant_attribute' TO 'place_attribute';

UPDATE core_entities SET facet = 'cuisine'
WHERE type = 'place_attribute' AND facet IS NULL AND lower(name) IN (
'afghani', 'african', 'american', 'argentinian', 'asian', 'asian fusion', 'australian', 'austrian', 'bangladeshi', 'basque', 'bavarian', 'belgian', 'brazilian', 'british', 'burmese', 'cajun', 'californian', 'cambodian', 'cantonese', 'caribbean', 'chilean', 'chinese', 'colombian', 'croatian', 'cuban', 'czech', 'danish', 'dutch', 'eastern european', 'ethiopian', 'european', 'filipino', 'french', 'fusion', 'german', 'greek', 'halal', 'hawaiian', 'hungarian', 'indian', 'indonesian', 'irish', 'israeli', 'italian', 'japanese', 'korean', 'latin american', 'lebanese', 'malaysian', 'mediterranean', 'mexican', 'middle eastern', 'moroccan', 'north indian', 'pakistani', 'persian', 'peruvian', 'polish', 'portuguese', 'romanian', 'russian', 'scandinavian', 'soul food', 'south american', 'south indian', 'southwestern', 'spanish', 'sri lankan', 'swiss', 'taiwanese', 'tex-mex', 'thai', 'tibetan', 'turkish', 'ukrainian', 'vietnamese', 'western'
);

UPDATE core_entities SET facet = 'venue_kind'
WHERE type = 'place_attribute' AND facet IS NULL AND lower(name) IN (
'acai shop', 'bagel shop', 'bakery', 'bar', 'bar and grill', 'barbecue', 'beer garden', 'bistro', 'breakfast restaurant', 'brewery', 'brewpub', 'brunch restaurant', 'buffet', 'burger', 'burritos', 'cafe', 'cafeteria', 'cake shop', 'candy store', 'cat cafe', 'chicken restaurant', 'chicken wings', 'chinese noodles', 'chocolate factory', 'chocolate shop', 'cocktail bar', 'coffee roastery', 'coffee shop', 'coffee stand', 'confectionery', 'deli', 'dessert restaurant', 'dessert shop', 'dim sum', 'diner', 'dog cafe', 'donut shop', 'dumplings', 'falafel', 'family restaurant', 'fast food', 'fine dining', 'fish and chips', 'fondue', 'food court', 'gastropub', 'gyros', 'hookah bar', 'hot dog stand', 'hot dogs', 'hot pot', 'ice cream shop', 'irish pub', 'izakaya', 'japanese curry', 'juice shop', 'kebab shop', 'korean barbecue', 'lounge', 'mongolian barbecue', 'noodle shop', 'oyster bar', 'pastry shop', 'pizza', 'pizza delivery', 'pub', 'ramen', 'restaurant', 'salad shop', 'sandwich shop', 'seafood', 'shawarma', 'snack bar', 'soup', 'sports bar', 'steakhouse', 'sushi', 'tacos', 'tapas', 'tea house', 'tonkatsu', 'vegan', 'wine bar', 'winery', 'yakiniku', 'yakitori'
);

UPDATE core_entities SET facet = 'amenity'
WHERE type = 'place_attribute' AND facet IS NULL;
