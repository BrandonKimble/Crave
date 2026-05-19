# Markets Runtime

`core_markets` is the canonical runtime market contract. Search, polls,
ranking, demand aggregation, and Reddit collection should use `marketKey`
values from this table, not provider ids.

## Market Identity

Runtime market keys are app-owned and provider-neutral:

- `region-us-tx-austin`
- `region-us-ny-new-york`
- `locality-us-tx-spicewood`

`regional` means a product collection or planning region. Regional rows are
configured by the app and may be linked to Reddit communities. Their
authoritative geometry should be a union of provider-backed boundary polygons,
not a handcrafted rectangle. Current seed regions use TomTom
`CountrySecondarySubdivision` source polygons.

`locality` means a user-visible place boundary bootstrapped from TomTom. Active
locality rows must keep their TomTom source boundary identity in
`source_boundary_provider`, `source_boundary_id`, and `source_boundary_type` so
we can refresh or audit the provider-backed boundary.

`manual` is reserved for explicitly configured markets that do not fit either
runtime category.

## Source Boundaries

`geo_boundary_features` stores provider-backed source geometries used to create
or refresh locality and regional markets. The runtime locality path currently
uses TomTom municipality boundaries. Seeded regional collection markets are
stored as app-owned market keys with geometry built from configured TomTom source
boundary unions.

Provider ids belong in `geo_boundary_features` and `core_markets.source_boundary_*`;
they must not become `marketKey` values.

`bbox_*` columns are derived from stored geometry and are used as cheap
prefilters and viewport/bias helpers. They are not the authoritative market
shape; exact membership should still use the stored polygon geometry.

## Collection Scope

Reddit collection is enabled by active rows in `collection_communities`.

A locality can record user demand independently from collection scope. If that
locality overlaps or maps to a configured collection region, demand facts can
also carry a `collectableMarketKey` for that region. If no configured collection
region exists, `collectableMarketKey` stays `null`; the fact can still support
polls and local demand, but it should not enqueue Reddit collection work.

Example:

- User searches from Spicewood.
- If Austin's regional market already covers the request, the UI/search market
  remains `region-us-tx-austin` and no TomTom call is needed.
- If the request is outside known coverage, or a viewport has a qualifying
  uncovered component, active search/poll intent can bootstrap a TomTom-backed
  locality such as `locality-us-tx-spicewood`.
- If that locality overlaps a configured collection region, collection work uses
  the region's collectable market key.
- Passive reads do not bootstrap locality rows; they can still display the
  existing regional market until there is active locality intent.

## Bootstrap Rules

Active search submit and active poll creation may bootstrap missing TomTom
locality markets only when local coverage does not already resolve the request
or when a viewport has a qualifying uncovered component. Passive reads,
autocomplete, enrichment, and background collection must not bootstrap markets.

Viewport bootstrap should process one uncovered boundary candidate per pass, then
recompute coverage. It should not loop through stale anchors from the same
coverage snapshot.

## Delete Gates

The market cutover gate should fail if active schema/runtime/seed code contains
old provider-shaped market identity, old fallback locality vocabulary, stale
candidate response names, or passive bootstrap paths.
